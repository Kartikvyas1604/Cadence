// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title Clob
 * @notice Secondary Cadence-slot CLOB (Extended §1): limit buy/sell of
 *         ERC-1155 epoch slots. Matching transfers slots + quote escrow
 *         atomically. Open orders expire at epoch refresh — the book resets
 *         with the capacity it trades. Slots are capacity tickets, not LP
 *         shares; the CLOB never touches LP equity.
 *
 * Escrow:
 *  - Buy orders escrow ETH (size * price).
 *  - Sell orders escrow slots via ERC-1155 safeTransferFrom (approve first).
 *  - price = wei ETH per wei ETH of capacity (dimensionless, scaled 1e18);
 *    order value = size * price / 1e18.
 */
contract Clob is ERC1155Holder, ReentrancyGuard {
    using Address for address payable;

    enum Side {
        Buy,
        Sell
    }
    enum Status {
        None,
        Open,
        Filled,
        Canceled,
        Expired
    }

    struct Order {
        address maker;
        Side side;
        uint256 epochId;
        uint256 size;
        uint256 price; // wei ETH per wei ETH capacity
        uint256 filled;
        Status status;
    }

    error NotOpen();
    error NotOwner();
    error EpochMismatch();
    error ZeroOrder();
    error CrossMismatch();
    error EpochNotExpired();

    event OrderPlaced(
        uint256 indexed id, address indexed maker, Side side, uint256 epochId, uint256 size, uint256 price
    );
    event OrderCanceled(uint256 indexed id, address indexed maker, uint256 refunded);
    event ClobTrade(
        uint256 indexed buyId,
        uint256 indexed sellId,
        address indexed buyer,
        address seller,
        uint256 size,
        uint256 price
    );
    event OrdersExpired(uint256 indexed epochId, uint256 count);

    /// @notice Cadence hook — epoch clock + slots address.
    address public immutable hook;
    IERC1155 public immutable slots;

    uint256 public nextOrderId;
    mapping(uint256 orderId => Order) public orders;
    /// @notice epoch => open order ids (expired/canceled/filled entries skipped).
    mapping(uint256 epochId => uint256[]) private openIds;
    /// @notice id => index+1 in openIds[epoch]; 0 = not tracked.
    mapping(uint256 id => uint256) private openIndex;

    constructor(address hook_, IERC1155 slots_) {
        hook = hook_;
        slots = slots_;
        nextOrderId = 1;
    }

    function currentEpoch() public view returns (uint256) {
        return ICadenceEpoch(hook).currentEpoch();
    }

    // ------------------------------------------------------------------
    // Place
    // ------------------------------------------------------------------

    /// @notice Place a limit order for the CURRENT epoch only.
    ///         Buy: escrow msg.value = size * price / 1e18 (excess refunded).
    ///         Sell: escrow `size` slot units via prior approval.
    function placeOrder(bool buy, uint256 epochId, uint256 size, uint256 price)
        external
        payable
        nonReentrant
        returns (uint256 id)
    {
        if (size == 0 || price == 0) revert ZeroOrder();
        if (epochId != currentEpoch()) revert EpochMismatch();

        id = nextOrderId++;
        Order storage o = orders[id];
        o.maker = msg.sender;
        o.side = buy ? Side.Buy : Side.Sell;
        o.epochId = epochId;
        o.size = size;
        o.price = price;
        o.status = Status.Open;
        openIds[epochId].push(id);
        openIndex[id] = openIds[epochId].length;

        if (buy) {
            uint256 escrow = (size * price) / 1e18;
            if (msg.value < escrow) revert ZeroOrder();
            Address.sendValue(payable(msg.sender), msg.value - escrow);
        } else {
            slots.safeTransferFrom(msg.sender, address(this), epochId, size, "");
        }

        emit OrderPlaced(id, msg.sender, o.side, epochId, size, price);
        return id;
    }

    // ------------------------------------------------------------------
    // Cancel — refund remaining escrow (ETH for buys, slots for sells)
    // ------------------------------------------------------------------

    function cancelOrder(uint256 id) external nonReentrant {
        Order storage o = orders[id];
        if (o.maker != msg.sender) revert NotOwner();
        if (o.status != Status.Open) revert NotOpen();

        o.status = Status.Canceled;
        _untrack(o.epochId, id);

        uint256 remaining = o.size - o.filled;
        if (o.side == Side.Buy) {
            uint256 escrow = (remaining * o.price) / 1e18;
            if (escrow > 0) Address.sendValue(payable(msg.sender), escrow);
        } else {
            slots.safeTransferFrom(address(this), msg.sender, o.epochId, remaining, "");
        }
        emit OrderCanceled(id, msg.sender, remaining);
    }

    // ------------------------------------------------------------------
    // Match — permissionless; trade executes at the SELL price (maker),
    // price-time priority is left to the matcher order.
    // ------------------------------------------------------------------

    function matchOrders(uint256 buyId, uint256 sellId) external nonReentrant returns (uint256 filled) {
        Order storage b = orders[buyId];
        Order storage sell = orders[sellId];

        if (b.status != Status.Open || sell.status != Status.Open) revert NotOpen();
        if (b.side != Side.Buy || sell.side != Side.Sell) revert CrossMismatch();
        if (b.epochId != sell.epochId || b.epochId != currentEpoch()) revert EpochMismatch();

        filled = b.size - b.filled <= sell.size - sell.filled ? b.size - b.filled : sell.size - sell.filled;
        if (filled == 0) revert ZeroOrder();

        // execution price = resting sell price; buyer refunded the difference
        uint256 tradePrice = sell.price;
        require(b.price >= tradePrice, "no cross");
        uint256 value = (filled * tradePrice) / 1e18;
        uint256 refund = ((filled * (b.price - tradePrice)) / 1e18);

        b.filled += filled;
        sell.filled += filled;
        // C4: only untrack orders that are FULLY filled — partial fills stay
        // in the epoch book so expireEpoch refunds the remaining escrow
        if (b.filled == b.size) {
            b.status = Status.Filled;
            _untrack(b.epochId, buyId);
        }
        if (sell.filled == sell.size) {
            sell.status = Status.Filled;
            _untrack(sell.epochId, sellId);
        }

        // settle: escrowed ETH to seller, escrowed slots to buyer
        Address.sendValue(payable(sell.maker), value);
        if (refund > 0) Address.sendValue(payable(b.maker), refund);
        slots.safeTransferFrom(address(this), b.maker, sell.epochId, filled, "");

        emit ClobTrade(buyId, sellId, b.maker, sell.maker, filled, tradePrice);
    }

    // ------------------------------------------------------------------
    // Epoch expiry — open orders die with their epoch
    // ------------------------------------------------------------------

    /// @notice Refund all open orders of a PAST epoch. Permissionless.
    /// H2: iterate a MEMORY snapshot — the storage array is mutated by
    /// _untrack (swap-and-pop), so forward-iterating it live skips the order
    /// swapped into the current index.
    function expireEpoch(uint256 epochId) external {
        if (epochId >= currentEpoch()) revert EpochNotExpired();
        uint256[] memory ids = openIds[epochId];
        uint256 count = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            Order storage o = orders[id];
            if (o.status != Status.Open) continue;
            o.status = Status.Expired;
            _untrack(epochId, id);
            uint256 remaining = o.size - o.filled;
            if (o.side == Side.Buy) {
                uint256 escrow = (remaining * o.price) / 1e18;
                if (escrow > 0) Address.sendValue(payable(o.maker), escrow);
            } else {
                slots.safeTransferFrom(address(this), o.maker, o.epochId, remaining, "");
            }
            count++;
        }
        emit OrdersExpired(epochId, count);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function openOrders(uint256 epochId) external view returns (uint256[] memory ids) {
        uint256[] memory all = openIds[epochId];
        uint256 n = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (orders[all[i]].status == Status.Open) n++;
        }
        ids = new uint256[](n);
        uint256 j = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (orders[all[i]].status == Status.Open) ids[j++] = all[i];
        }
    }

    function _untrack(uint256 epochId, uint256 id) internal {
        uint256 idx = openIndex[id];
        if (idx == 0) return;
        uint256[] storage ids = openIds[epochId];
        uint256 pos = idx - 1;
        uint256 last = ids[ids.length - 1];
        ids[pos] = last;
        openIndex[last] = pos + 1;
        ids.pop();
        openIndex[id] = 0;
    }
}

interface ICadenceEpoch {
    function currentEpoch() external view returns (uint256);
}
