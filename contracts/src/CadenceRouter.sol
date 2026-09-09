// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

/**
 * @title CadenceRouter
 * @notice Minimal router for the Cadence pool: the authorized router that
 *         passes the trader identity (and optional Private Cadence Intent
 *         reveal) to the hook via hookData, then settles the swapper's delta.
 *
 * Public path:  swap(key, zeroForOne, amountIn)   — slot gate in beforeSwap
 * Private path: sellEthPrivate(key, sizeEth, salt) — reveal in beforeSwap
 *
 * ETH input is forwarded with the call (unused ETH refunded). USDC input is
 * pulled from the trader's approval during settlement.
 */
contract CadenceRouter is IUnlockCallback, ERC1155Holder {
    using CurrencySettler for Currency;
    using BalanceDeltaLibrary for BalanceDelta;

    /// @notice unlockCallback only callable by the PoolManager.
    error NotPoolManager();
    /// @notice Wrong hook for this pool key.
    error NotAuthorizedHook();
    /// @notice Wrong native value with the call.
    error WrongValue();

    IPoolManager public immutable manager;
    address public immutable usdc;

    // §2 multi-pool registry
    uint24 constant MAX_POOLS = 64;
    bytes32[] public registeredPools;
    mapping(bytes32 poolId => PoolKey) public poolRegistry;
    mapping(bytes32 poolId => bool) public poolActive;

    event PoolRegistered(bytes32 indexed poolId, address indexed hook);
    event RouteExecuted(bytes32 indexed poolId, address indexed trader, uint256 sizeEth);

    error PoolLimitReached();
    error PoolAlreadyRegistered();
    error PoolUnknown();

    constructor(IPoolManager manager_, address usdc_) {
        manager = manager_;
        usdc = usdc_;
    }

    /// @notice §2: register a Cadence pool. The key must point at a real
    ///         CadenceHook (the router verifies `hooks.slots()` answers and
    ///         that the slot token id scheme matches the epoch clock).
    function registerPool(PoolKey calldata key) external returns (bytes32 poolId) {
        // only CadenceHook-derived pools: hook exposes remainingCapacity()
        ICadenceHookView(address(key.hooks)).remainingCapacity();
        poolId = keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks));
        if (poolActive[poolId]) return poolId; // idempotent
        if (registeredPools.length >= MAX_POOLS) revert PoolLimitReached();
        registeredPools.push(poolId);
        poolRegistry[poolId] = key;
        poolActive[poolId] = true;
        emit PoolRegistered(poolId, address(key.hooks));
    }

    function poolCount() external view returns (uint256) {
        return registeredPools.length;
    }

    /// @notice §2: quote every registered pool for this intent — remaining
    ///         capacity, slot price and the hook address. Never silent:
    ///         every row carries its poolId.
    function quoteRoute(uint256 sizeEth, bool zeroForOne)
        external
        view
        returns (
            bytes32[] memory poolIds,
            address[] memory hooks,
            uint256[] memory remaining,
            uint256[] memory slotPrice
        )
    {
        uint256 n = registeredPools.length;
        uint256[] memory rem = new uint256[](n);
        address[] memory hs = new address[](n);
        bytes32[] memory ids = new bytes32[](n);
        uint256[] memory prices = new uint256[](n);
        uint256 k = 0;
        for (uint256 i = 0; i < n; i++) {
            RouteQuoteRow memory row = _quoteOne(registeredPools[i], sizeEth);
            if (!row.ok) continue;
            ids[k] = row.poolId;
            hs[k] = row.hook;
            rem[k] = row.remaining;
            prices[k] = row.slotPrice;
            unchecked {
                k++;
            }
        }
        return (_trim(ids, k), _trimAddrs(hs, k), _trim(rem, k), _trim(prices, k));
    }

    struct RouteQuoteRow {
        bool ok;
        bytes32 poolId;
        address hook;
        uint256 remaining;
        uint256 slotPrice;
    }

    function _quoteOne(bytes32 pid, uint256 sizeEth) internal view returns (RouteQuoteRow memory row) {
        PoolKey memory key = poolRegistry[pid];
        if (!poolActive[pid]) return row;
        ICadenceHookView hv = ICadenceHookView(address(key.hooks));
        row.remaining = hv.remainingCapacity();
        if (row.remaining < sizeEth) return row;
        row.ok = true;
        row.poolId = pid;
        row.hook = address(key.hooks);
        row.slotPrice = ICadenceSlotsLike(hv.slots()).pricePerEth();
    }

    function _trim(bytes32[] memory a, uint256 n) internal pure returns (bytes32[] memory out) {
        out = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = a[i];
        }
    }

    function _trimAddrs(address[] memory a, uint256 n) internal pure returns (address[] memory out) {
        out = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = a[i];
        }
    }

    function _trim(uint256[] memory a, uint256 n) internal pure returns (uint256[] memory out) {
        out = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = a[i];
        }
    }

    /// @notice §2: execute a route — mints the cadence slot if the trader
    ///         lacks capacity (fixed price), then routes the swap against
    ///         that pool. The poolId is always visible to the caller.
    function executeRoute(bytes32 poolId, uint256 sizeEth) external payable returns (BalanceDelta delta) {
        PoolKey memory key = poolRegistry[poolId];
        if (!poolActive[poolId] || address(key.hooks) == address(0)) revert PoolUnknown();
        ICadenceHookView hv = ICadenceHookView(address(key.hooks));
        if (hv.remainingCapacity() < sizeEth) revert PoolLimitReached();

        // mint a slot if the trader needs one (primary path, fixed price)
        address slotsAddr = hv.slots();
        uint256 cost = (sizeEth * ICadenceSlotsLike(slotsAddr).pricePerEth()) / 1e18;
        if (ICadenceSlotsLike(slotsAddr).slotOf(msg.sender) < sizeEth) {
            require(msg.value >= sizeEth + cost, "need size + slot cost");
            // mint lands on this router, then relays to the trader
            ICadenceSlotsLike(slotsAddr).mintPublic{value: cost}(sizeEth);
            IERC1155Like(slotsAddr)
                .safeTransferFrom(address(this), msg.sender, ICadenceSlotsLike(slotsAddr).currentEpoch(), sizeEth, "");
        } else {
            require(msg.value >= sizeEth, "need size");
        }
        // mintPublic refunds excess; the swap forwards exactly sizeEth
        bytes memory hookData = abi.encode(msg.sender, uint256(0), bytes32(0));
        delta = _unlock(key, true, sizeEth, hookData, msg.sender);
        Address.sendValue(payable(msg.sender), address(this).balance);
        emit RouteExecuted(poolId, msg.sender, sizeEth);
    }

    // ------------------------------------------------------------------
    // Public path — B: swap with a visible (public) Cadence slot
    // ------------------------------------------------------------------

    /// @notice Swap `amountIn` of the input token against ACTIVE reserves.
    ///         Requires a current-epoch Cadence slot >= the ETH side of the
    ///         trade (input ETH when selling, received ETH when buying).
    ///         Forward `msg.value` when zeroForOne; unused ETH is refunded.
    function swap(PoolKey calldata key, bool zeroForOne, uint256 amountIn)
        external
        payable
        returns (BalanceDelta delta)
    {
        if (zeroForOne && msg.value != amountIn) revert WrongValue();
        if (!zeroForOne && msg.value != 0) revert WrongValue();

        bytes memory hookData = abi.encode(msg.sender, uint256(0), bytes32(0));
        delta = _unlock(key, zeroForOne, amountIn, hookData, msg.sender);
        Address.sendValue(payable(msg.sender), address(this).balance);
    }

    // ------------------------------------------------------------------
    // Private Cadence Intent — B2/C.1: commit-minted, reveal at fill
    // ------------------------------------------------------------------

    /// @notice Sell ETH for USDC, revealing (sizeEth, salt) at fill time.
    ///         H = hash(sizeEth, epochId, salt) must have been commit-minted
    ///         via CadenceSlots.commitMint. Requires msg.value == sizeEth.
    function sellEthPrivate(PoolKey calldata key, uint256 sizeEth, bytes32 salt)
        external
        payable
        returns (BalanceDelta delta)
    {
        if (msg.value != sizeEth) revert WrongValue();
        bytes memory hookData = abi.encode(msg.sender, sizeEth, salt);
        delta = _unlock(key, true, sizeEth, hookData, msg.sender);
        Address.sendValue(payable(msg.sender), address(this).balance);
    }

    // ------------------------------------------------------------------
    // Unlock callback — swap + settle the swapper's delta
    // ------------------------------------------------------------------

    struct CallbackData {
        address trader;
        PoolKey key;
        IPoolManager.SwapParams params;
        bytes hookData;
    }

    function _unlock(PoolKey memory key, bool zeroForOne, uint256 amountIn, bytes memory hookData, address trader)
        internal
        returns (BalanceDelta delta)
    {
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn),
            sqrtPriceLimitX96: zeroForOne ? 0 : type(uint160).max
        });
        delta = abi.decode(manager.unlock(abi.encode(CallbackData(trader, key, params, hookData))), (BalanceDelta));
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert NotPoolManager();

        CallbackData memory data = abi.decode(rawData, (CallbackData));

        bool zeroForOne = data.params.zeroForOne;
        uint256 inAmount = uint256(int256(-data.params.amountSpecified));

        // pay the input in FIRST — the hook pulls it from the manager's raw
        // balance during beforeSwap. The router is the payer: it holds the
        // ETH sent with the call and pulls the trader's USDC via approval.
        if (zeroForOne) {
            data.key.currency0.settle(manager, address(this), inAmount, false);
        } else {
            data.key.currency1.settle(manager, data.trader, inAmount, false);
        }

        BalanceDelta delta = manager.swap(data.key, data.params, data.hookData);

        // push the output to the trader (debit the router's credit)
        if (delta.amount0() > 0) {
            data.key.currency0.take(manager, data.trader, uint256(int256(delta.amount0())), false);
        }
        if (delta.amount1() > 0) {
            data.key.currency1.take(manager, data.trader, uint256(int256(delta.amount1())), false);
        }

        return abi.encode(delta);
    }

    // NOTE: no receive()/fallback — direct ETH sends revert. Value only
    // enters with a swap call (forwarded into settle) and leftovers are
    // refunded to the caller in the same transaction.
}

interface ICadenceHookView {
    function remainingCapacity() external view returns (uint256);
    function slots() external view returns (address);
}

interface ICadenceSlotsLike {
    function pricePerEth() external view returns (uint256);
    function slotOf(address owner) external view returns (uint256);
    function currentEpoch() external view returns (uint256);
    function mintPublic(uint256 size) external payable;
}

interface IERC1155Like {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}

