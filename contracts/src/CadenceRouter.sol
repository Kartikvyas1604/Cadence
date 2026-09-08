// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

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
contract CadenceRouter is IUnlockCallback {
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

    constructor(IPoolManager manager_, address usdc_) {
        manager = manager_;
        usdc = usdc_;
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

    function _unlock(PoolKey calldata key, bool zeroForOne, uint256 amountIn, bytes memory hookData, address trader)
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
