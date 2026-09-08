// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";

/**
 * @title CadenceHook
 * @notice PA-AMM-style Uniswap v4 hook that tokenizes scarce per-epoch
 *         execution capacity as ERC-1155 Cadence slots.
 *
 * Mechanism:
 *  - Reserves are split ACTIVE / PASSIVE each epoch refresh:
 *      active  = lambda * total   (tradable this epoch)
 *      passive = total - active   (locked until refresh)
 *  - beforeSwap gates EVERY fill: the trader must hold a Cadence slot
 *    >= the ETH-side trade size (public path), or reveal a Private Cadence
 *    Intent commitment (private path). Capacity is consumed, then the swap
 *    executes against ACTIVE reserves only, via hook custom accounting.
 *  - Reject paths: NoCadenceSlot, OversizeVsSlot, OversizeVsActive,
 *    PassiveUnlock (same-block order splitting cannot reach passive — active
 *    only shrinks within an epoch), BadReveal.
 *  - Unused Cadence slots expire worthless at epoch end (slot id = epoch id).
 *
 * Accounting: the hook holds raw token balances as reserves. The pool itself
 * is a zero-liquidity v4 pool; the hook provides the entire swap delta
 * (custom-curve pattern) against active reserves only.
 */
contract CadenceHook is IHooks {
    using Hooks for IHooks;
    using CurrencySettler for Currency;
    using SafeCast for uint256;

    // ------------------------------------------------------------------
    // Errors (reject paths)
    // ------------------------------------------------------------------

    /// @notice Trader holds no Cadence slot for the current epoch.
    error NoCadenceSlot();
    /// @notice Trade size exceeds the trader's Cadence slot capacity.
    error OversizeVsSlot();
    /// @notice Trade size exceeds the ACTIVE reserves for this epoch.
    error OversizeVsActive();
    /// @notice Active reserves are drained — a same-block split cannot unlock passive.
    error PassiveUnlock();
    /// @notice reveal(size, salt) does not hash to a live commitment.
    error BadReveal();
    /// @notice Only exact-input swaps are supported (slot = ETH-side size).
    error ExactOutputUnsupported();
    /// @notice Only the authorized router may pass trader identities in hookData.
    error UntrustedRouter();
    /// @notice hookData with trader identity is required.
    error MissingTrader();
    /// @notice Zero amount.
    error ZeroSwap();
    /// @notice Caller is not the PoolManager.
    error NotPoolManager();

    event CadenceSwap(
        uint256 indexed epochId,
        address indexed trader,
        bool zeroForOne,
        uint256 sizeInEth,
        uint256 outAmount,
        bool fromCommitment
    );
    event EpochRefreshed(
        uint256 indexed epochId, uint256 activeEth, uint256 activeUsdc, uint256 passiveEth, uint256 passiveUsdc
    );

    // ------------------------------------------------------------------
    // Config
    // ------------------------------------------------------------------

    IPoolManager public immutable manager;
    address public immutable slots;
    address public immutable usdc;
    /// @notice The only router allowed to pass trader identities in hookData.
    address public immutable router;
    /// @notice Fraction of total reserves that is ACTIVE each epoch, in bps.
    uint256 public immutable lambdaBps;
    /// @notice Epoch length in blocks. epochId = block.number / epochLengthBlocks.
    uint256 public immutable epochLengthBlocks;

    // ------------------------------------------------------------------
    // Reserves — raw balances held by this hook
    // ------------------------------------------------------------------

    /// @notice ACTIVE reserve: tradable this epoch.
    uint256 public activeEth;
    uint256 public activeUsdc;
    /// @notice PASSIVE reserve: locked until refresh.
    uint256 public passiveEth;
    uint256 public passiveUsdc;
    /// @notice Total funded (active + passive + seeds not yet partitioned).
    uint256 public totalEth;
    uint256 public totalUsdc;

    /// @notice epoch => active ETH depth snapshot (capacity budget for slots).
    mapping(uint256 epochId => uint256) public epochCapacityEth;
    uint256 public lastRefreshedEpoch;

    // no epoch has been refreshed yet (0 is a valid epoch id)
    uint256 private constant NEVER = type(uint256).max;

    constructor(
        IPoolManager manager_,
        address usdc_,
        address slots_,
        address router_,
        uint256 lambdaBps_,
        uint256 epochLengthBlocks_
    ) {
        manager = manager_;
        usdc = usdc_;
        slots = slots_;
        router = router_;
        lambdaBps = lambdaBps_;
        epochLengthBlocks = epochLengthBlocks_;
        lastRefreshedEpoch = type(uint256).max;

        Hooks.validateHookPermissions(this, getHookPermissions());
    }

    // ------------------------------------------------------------------
    // Hook permissions: beforeSwap + beforeSwapReturnDelta only
    // ------------------------------------------------------------------

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterAddLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(manager)) revert NotPoolManager();
        _;
    }

    // ------------------------------------------------------------------
    // Seeding — LP / pool deployer funds the hook's reserves
    // ------------------------------------------------------------------

    /// @notice Seed ETH reserves. Re-partitions active/passive immediately.
    function seedEth() external payable {
        if (msg.value == 0) revert ZeroSwap();
        _repartition();
    }

    /// @notice Seed USDC reserves. Re-partitions active/passive immediately.
    function seedUsdc(uint256 amount) external {
        if (amount == 0) revert ZeroSwap();
        IERC20Minimal(usdc).transferFrom(msg.sender, address(this), amount);
        _repartition();
    }

    // ------------------------------------------------------------------
    // Epoch refresh — A: unlock/refresh, expire prior capacity
    // ------------------------------------------------------------------

    /// @notice Re-partition reserves for a new epoch: active = lambda * total.
    ///         Permissionless — anyone may refresh (no admin latency).
    function refreshEpoch() external {
        _refreshEpoch();
    }

    function currentEpoch() public view returns (uint256) {
        return block.number / epochLengthBlocks;
    }

    function _refreshEpoch() internal {
        uint256 epochId = currentEpoch();
        if (epochId == lastRefreshedEpoch) return;
        _repartition();
    }

    /// @notice active = lambda * total; passive = total - active.
    ///         Totals read ground truth from this hook's raw balances (seeds
    ///         and swap inflows both land here).
    function _repartition() internal {
        uint256 epochId = currentEpoch();
        lastRefreshedEpoch = epochId;

        totalEth = address(this).balance;
        totalUsdc = IERC20Minimal(usdc).balanceOf(address(this));

        // active = lambda * total; passive = total - active
        activeEth = (totalEth * lambdaBps) / 10_000;
        activeUsdc = (totalUsdc * lambdaBps) / 10_000;
        passiveEth = totalEth - activeEth;
        passiveUsdc = totalUsdc - activeUsdc;

        // epoch capacity budget for Cadence slots = active ETH depth
        epochCapacityEth[epochId] = activeEth;

        emit EpochRefreshed(epochId, activeEth, activeUsdc, passiveEth, passiveUsdc);
    }

    // ------------------------------------------------------------------
    // beforeSwap — C: gate + active-only execution
    // ------------------------------------------------------------------

    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        (BeforeSwapDelta hookDelta,) = _handleSwap(sender, key, params, hookData);
        return (IHooks.beforeSwap.selector, hookDelta, 0);
    }

    /// @notice Gate + active-only execution. Split out of beforeSwap to keep
    ///         the stack shallow without via-ir.
    function _handleSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) internal returns (BeforeSwapDelta hookDelta, uint256 out) {
        if (params.amountSpecified >= 0) revert ExactOutputUnsupported();
        uint256 size = uint256(-params.amountSpecified);
        if (size == 0) revert ZeroSwap();

        // epoch refresh happens before every gate/quote
        _refreshEpoch();

        // decode trader identity + optional Private Cadence Intent reveal.
        // hookData is mandatory and must come from the authorized router.
        if (hookData.length == 0) revert MissingTrader();
        if (sender != router) revert UntrustedRouter();
        Intent memory intent = _decode(hookData);

        (Currency inputC, Currency outputC, bool zeroForOne, uint256 activeIn, uint256 activeOut) =
            _directionAndActive(key, params.zeroForOne);

        if (activeIn == 0 || size > activeIn) {
            // reject: oversize vs active / same-block passive unlock attempt
            if (activeIn == 0) revert PassiveUnlock();
            revert OversizeVsActive();
        }
        out = _quoteOut(activeIn, activeOut, size);
        if (out == 0) revert OversizeVsActive();

        // ETH side of the trade = the scarce capacity consumed
        uint256 sizeInEth = zeroForOne ? size : out;
        bool fromCommitment = _gate(intent.trader, intent.revealSize, intent.salt, sizeInEth);

        hookDelta = _execute(inputC, outputC, zeroForOne, size, out, sizeInEth, fromCommitment, intent.trader);
    }

    /// @notice Decoded hookData: trader identity + optional Private Cadence
    ///         Intent reveal (revealSize, salt).
    struct Intent {
        address trader;
        uint256 revealSize;
        bytes32 salt;
    }

    function _decode(bytes calldata hookData) internal pure returns (Intent memory) {
        (address trader, uint256 revealSize, bytes32 salt) = abi.decode(hookData, (address, uint256, bytes32));
        return Intent(trader, revealSize, salt);
    }

    /// @notice Consume capacity: reveal path (Private Cadence Intent — C.1)
    ///         or public path (current-epoch slot >= size — C.2/C.3).
    function _gate(address trader, uint256 revealSize, bytes32 salt, uint256 sizeInEth)
        internal
        returns (bool fromCommitment)
    {
        if (revealSize != 0) {
            if (revealSize != sizeInEth) revert BadReveal();
            uint256 consumed = CadenceSlotsLike(slots).revealAndConsume(trader, sizeInEth, salt);
            if (consumed != sizeInEth) revert BadReveal();
            fromCommitment = true;
        } else {
            uint256 capacity = CadenceSlotsLike(slots).slotOf(trader);
            if (capacity == 0) revert NoCadenceSlot();
            if (capacity < sizeInEth) revert OversizeVsSlot();
            CadenceSlotsLike(slots).consume(trader, sizeInEth);
        }
    }

    /// @notice Debit active reserves, settle the custom delta, emit + return
    ///         the hook delta. Passive reserves are untouched.
    function _execute(
        Currency inputC,
        Currency outputC,
        bool zeroForOne,
        uint256 size,
        uint256 out,
        uint256 sizeInEth,
        bool fromCommitment,
        address trader
    ) internal returns (BeforeSwapDelta) {
        // update ACTIVE reserves; passive untouched — locked until refresh
        if (zeroForOne) {
            activeEth -= size;
            activeUsdc -= out;
        } else {
            activeUsdc -= size;
            activeEth -= out;
        }

        // settle the custom delta: pull input from the manager (the router
        // paid it in before swap), push output into the manager for the
        // router to deliver. Pool swap is no-oped (hook delta specified
        // cancels amountToSwap; the pool has zero liquidity).
        inputC.take(manager, address(this), size, false);
        outputC.settle(manager, address(this), out, false);

        // hook delta: +size specified (hook owed input), -out unspecified
        // (hook owes output). Swapper nets (-size, +out) after Hooks.afterSwap.
        // (int128 casts are safe: size is bounded below.)
        require(size < 2 ** 127, "CadenceHook: size overflow");
        BeforeSwapDelta hookDelta = toBeforeSwapDelta(int128(uint128(size)), -int128(int256(out)));

        emit CadenceSwap(currentEpoch(), trader, zeroForOne, sizeInEth, out, fromCommitment);
        return hookDelta;
    }

    function _directionAndActive(PoolKey calldata key, bool zeroForOne)
        internal
        view
        returns (Currency inputC, Currency outputC, bool zf1, uint256 activeIn, uint256 activeOut)
    {
        // currency0 = native ETH, currency1 = USDC for the deployed pair
        inputC = zeroForOne ? key.currency0 : key.currency1;
        outputC = zeroForOne ? key.currency1 : key.currency0;
        zf1 = zeroForOne;
        activeIn = zeroForOne ? activeEth : activeUsdc;
        activeOut = zeroForOne ? activeUsdc : activeEth;
    }

    /// @notice Constant-product quote against ACTIVE reserves only.
    function _quoteOut(uint256 activeIn, uint256 activeOut, uint256 size) internal pure returns (uint256 out) {
        uint256 newIn = activeIn + size;
        out = activeOut - (activeIn * activeOut) / newIn;
    }

    // ------------------------------------------------------------------
    // Non-permissioned hook entry points — PoolManager never calls them
    // (address flags validated at deploy); they revert for defense.
    // ------------------------------------------------------------------

    error HookNotImplemented();

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    // ------------------------------------------------------------------
    // Views for the UI / subgraph
    // ------------------------------------------------------------------

    function reserves() external view returns (uint256 aEth, uint256 aUsdc, uint256 pEth, uint256 pUsdc) {
        (aEth, aUsdc, pEth, pUsdc) = (activeEth, activeUsdc, passiveEth, passiveUsdc);
    }

    function quoteOutUsdc(uint256 sizeEth) external view returns (uint256) {
        return _quoteOut(activeEth, activeUsdc, sizeEth);
    }

    /// @notice The hook custodies raw reserves (seeds and swap inflows land
    ///         here); native ETH enters via manager.take during swaps and
    ///         via seedEth.
    receive() external payable {}
}

interface CadenceSlotsLike {
    function slotOf(address owner) external view returns (uint256);
    function consume(address trader, uint256 size) external;
    function revealAndConsume(address trader, uint256 size, bytes32 salt) external returns (uint256);
}
