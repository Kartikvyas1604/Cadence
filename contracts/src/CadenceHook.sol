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
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

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
    using Address for address payable;

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
    /// @notice Withdraw would orphan active capacity already sold this epoch,
    ///  or exceed the LP's deposited value (spec safety bounds).
    error UnsafeWithdraw();

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
    event EpochCapacitySet(uint256 indexed epochId, uint256 activeBudget, uint256 passiveReserve);
    event CapacityExpired(uint256 indexed epochId, uint256 expiredCapacity);

    event LPDeposited(address indexed lp, uint256 ethIn, uint256 shares);
    event LPWithdrawn(address indexed lp, uint256 shares, uint256 ethOut);
    event SlotRevenueAccrued(uint256 indexed epochId, uint256 proceeds);
    event RevenueClaimed(address indexed lp, uint256 amountEth);
    event SwapFeeClaimed(address indexed lp, uint256 amountUsdc);

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
    /// @notice True once any fill consumed active depth this epoch —
    ///         blocks mid-epoch re-partitioning via seeds (passive-lock invariant).
    bool public consumedThisEpoch;

    // ------------------------------------------------------------------
    // LP accounting — A0. Slot ≠ share: shares are pool equity; slots are
    // expiring capacity tickets. Slot-sale revenue and swap fees are two
    // separate ledgers, both accrued pro-rata by shares.
    // ------------------------------------------------------------------

    uint256 public totalShares;
    mapping(address lp => uint256) public sharesOf;
    /// @notice Cumulative ETH deposited (gross) — caps withdrawal per spec.
    mapping(address lp => uint256) public depositedEth;
    /// @notice Cumulative ETH withdrawn.
    mapping(address lp => uint256) public withdrawnEth;

    /// @notice Slot-sale revenue per share, scaled 1e18 (ETH).
    uint256 public revAccPerShare;
    /// @notice Swap-fee per share, scaled 1e18 (USDC).
    uint256 public feeAccPerShare;
    mapping(address lp => uint256) public revCheckpoint;
    mapping(address lp => uint256) public feeCheckpoint;
    /// @notice Revenue owed but not yet payable (sold-capacity headroom was
    ///  exhausted). Survives full withdrawal; pays out once headroom frees.
    mapping(address lp => uint256) public strandedRev;

    /// @notice Swap fee on the OUTPUT quote token, in bps (default 30 = 0.30%).
    uint256 public swapFeeBps;
    /// @notice Protocol take of slot proceeds, in bps (default 1000 = 10%).
    uint256 public protocolTakeBps;
    /// @notice Treasury that withdraws the protocol take (immutable).
    address public immutable protocolTreasury;
    /// @notice Protocol take accrued on-chain (ETH) — withdrawn via withdrawProtocolRevenue.
    uint256 public accruedProtocolRevenue;

    event ProtocolRevenueWithdrawn(address indexed to, uint256 amount);

    // no epoch has been refreshed yet (0 is a valid epoch id)
    uint256 private constant NEVER = type(uint256).max;

    constructor(
        IPoolManager manager_,
        address usdc_,
        address slots_,
        address router_,
        uint256 lambdaBps_,
        uint256 epochLengthBlocks_,
        uint256 swapFeeBps_,
        uint256 protocolTakeBps_,
        address protocolTreasury_
    ) {
        manager = manager_;
        usdc = usdc_;
        slots = slots_;
        router = router_;
        lambdaBps = lambdaBps_;
        epochLengthBlocks = epochLengthBlocks_;
        swapFeeBps = swapFeeBps_;
        protocolTakeBps = protocolTakeBps_;
        protocolTreasury = protocolTreasury_;
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

    /// @notice Seed ETH reserves. Re-partitions ONLY while the epoch's active
    ///         depth is untouched; once any fill has consumed active depth,
    ///         seeds accrue to the next refresh. This keeps the epoch
    ///         invariant: a mid-epoch re-partition can never hand back depth
    ///         that fills already consumed (repeated dust-seeding cannot
    ///         unlock passive reserves).
    function seedEth() external payable {
        if (msg.value == 0) revert ZeroSwap();
        if (!consumedThisEpoch) _repartition();
    }

    /// @notice Seed USDC reserves. Same re-partition rule as seedEth.
    function seedUsdc(uint256 amount) external {
        if (amount == 0) revert ZeroSwap();
        IERC20Minimal(usdc).transferFrom(msg.sender, address(this), amount);
        if (!consumedThisEpoch) _repartition();
    }

    // ------------------------------------------------------------------
    // LP module — A0: deposit / withdraw / revenue / swap fees
    // ------------------------------------------------------------------

    /// @notice Deposit ETH for pool shares. Shares are equity — NOT cadence
    ///         slots. Re-partitions the λ split only while the epoch's active
    ///         depth is untouched (same rule as seeding).
    function depositEth() external payable returns (uint256 minted) {
        if (msg.value == 0) revert ZeroSwap();
        _refreshEpoch();

        uint256 balanceBefore = address(this).balance - msg.value;
        if (totalShares == 0 || balanceBefore == 0) {
            minted = msg.value;
        } else {
            minted = (msg.value * totalShares) / balanceBefore;
        }
        sharesOf[msg.sender] += minted;
        totalShares += minted;
        depositedEth[msg.sender] += msg.value;
        // new shares only earn revenue/fees from here on
        revCheckpoint[msg.sender] = revAccPerShare;
        feeCheckpoint[msg.sender] = feeAccPerShare;

        if (!consumedThisEpoch) _repartition();
        emit LPDeposited(msg.sender, msg.value, minted);
    }

    /// @notice Burn shares and withdraw ETH within spec safety bounds:
    ///         ethOut = shares * (eligible - soldCapacity) / totalShares,
    ///         capped by the LP's still-unwithdrawn deposit value. Accrued
    ///         slot revenue and swap fees are paid out in the same call.
    function withdrawEth(uint256 shares_) external returns (uint256 ethOut) {
        if (shares_ == 0) revert ZeroSwap();
        uint256 bal = sharesOf[msg.sender];
        if (shares_ > bal) revert UnsafeWithdraw();

        _refreshEpoch();
        uint256 safe = address(this).balance - _soldCapacityEth();
        ethOut = (shares_ * safe) / totalShares;

        // min(deposited - withdrawn, pro-rata of safe liquidity)
        uint256 maxByDeposit = depositedEth[msg.sender] - withdrawnEth[msg.sender];
        if (ethOut > maxByDeposit) revert UnsafeWithdraw();

        // settle both ledgers FIRST — claims must compute on pre-burn shares
        uint256 rev = _claimableRevenue(msg.sender);
        uint256 fee = _claimableSwapFee(msg.sender);

        // the revenue payout must never eat sold-capacity backing: cap at
        // (balance - ethOut - sold); unpaid remainder parks in strandedRev
        // so a full withdrawal never strands the claim
        uint256 headroom = address(this).balance - ethOut - _soldCapacityEth();
        uint256 pendingTotal = rev;
        rev = rev <= headroom ? rev : headroom;
        revCheckpoint[msg.sender] = revAccPerShare;
        feeCheckpoint[msg.sender] = feeAccPerShare;
        strandedRev[msg.sender] = pendingTotal - rev;

        sharesOf[msg.sender] = bal - shares_;
        totalShares -= shares_;
        withdrawnEth[msg.sender] += ethOut;

        Address.sendValue(payable(msg.sender), ethOut + rev);
        if (fee > 0) IERC20Minimal(usdc).transfer(msg.sender, fee);

        emit LPWithdrawn(msg.sender, shares_, ethOut);
        if (rev > 0) emit RevenueClaimed(msg.sender, rev);
        if (fee > 0) emit SwapFeeClaimed(msg.sender, fee);
    }

    /// @notice Claim accrued slot-sale revenue (ETH) only.
    function claimSlotRevenue() external returns (uint256 amount) {
        uint256 pending = _claimableRevenue(msg.sender);
        if (pending == 0) revert ZeroSwap();
        // never eat sold-capacity backing; the remainder stays claimable
        uint256 headroom = address(this).balance - _soldCapacityEth();
        amount = pending <= headroom ? pending : headroom;
        revCheckpoint[msg.sender] = revAccPerShare;
        strandedRev[msg.sender] = pending - amount;
        Address.sendValue(payable(msg.sender), amount);
        emit RevenueClaimed(msg.sender, amount);
    }

    /// @notice Claim accrued swap fees (USDC) only.
    function claimSwapFees() external returns (uint256 amount) {
        amount = _claimableSwapFee(msg.sender);
        if (amount == 0) revert ZeroSwap();
        feeCheckpoint[msg.sender] = feeAccPerShare;
        IERC20Minimal(usdc).transfer(msg.sender, amount);
        emit SwapFeeClaimed(msg.sender, amount);
    }

    /// @notice LP share of slot proceeds = 10000 - protocolTakeBps.
    function slotRevenueShareBps() public view returns (uint256) {
        return 10_000 - protocolTakeBps;
    }

    /// @notice Withdraw the accrued protocol take. Only the treasury itself.
    function withdrawProtocolRevenue(address to) external {
        if (msg.sender != protocolTreasury) revert UnsafeWithdraw();
        uint256 amount = accruedProtocolRevenue;
        if (amount == 0) revert ZeroSwap();
        accruedProtocolRevenue = 0;
        Address.sendValue(payable(to), amount);
        emit ProtocolRevenueWithdrawn(to, amount);
    }

    /// @notice LP pool of slot-sale proceeds (already net of the protocol take).
    function _accrueSlotRevenue(uint256 proceeds) internal {
        if (totalShares > 0 && proceeds > 0) {
            revAccPerShare += (proceeds * 1e18) / totalShares;
        }
        emit SlotRevenueAccrued(currentEpoch(), proceeds);
    }

    function _claimableRevenue(address lp) internal view returns (uint256) {
        return ((revAccPerShare - revCheckpoint[lp]) * sharesOf[lp]) / 1e18 + strandedRev[lp];
    }

    function _claimableSwapFee(address lp) internal view returns (uint256) {
        return ((feeAccPerShare - feeCheckpoint[lp]) * sharesOf[lp]) / 1e18;
    }

    /// @notice Remaining sellable capacity this epoch: budget - sold.
    function remainingCapacity() external view returns (uint256) {
        return epochCapacityEth[currentEpoch()] - _soldCapacityEth();
    }

    /// @notice Capacity sold this epoch (public mints + live commitments), ETH.
    function soldCapacityEth() public view returns (uint256) {
        return _soldCapacityEth();
    }

    function _soldCapacityEth() internal view returns (uint256) {
        uint256 epochId = currentEpoch();
        return CadenceSlotsLike(slots).mintedCapacity(epochId) + CadenceSlotsLike(slots).committedCapacity(epochId);
    }

    /// @notice Full LP position for the dashboard: deposited, shares, claimable
    ///         slot revenue (ETH), claimable swap fees (USDC), withdrawable ETH.
    function lpPosition(address lp)
        external
        view
        returns (
            uint256 deposited,
            uint256 shares,
            uint256 claimableRevenueEth,
            uint256 claimableSwapFeesUsdc,
            uint256 withdrawable
        )
    {
        deposited = depositedEth[lp] - withdrawnEth[lp];
        shares = sharesOf[lp];
        claimableRevenueEth = _claimableRevenue(lp);
        claimableSwapFeesUsdc = _claimableSwapFee(lp);
        uint256 safe = address(this).balance - _soldCapacityEth();
        uint256 proRata = totalShares > 0 ? (shares * safe) / totalShares : 0;
        withdrawable = proRata < deposited ? proRata : deposited;
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
        consumedThisEpoch = false;

        totalEth = address(this).balance;
        totalUsdc = IERC20Minimal(usdc).balanceOf(address(this));

        // active = lambda * total; passive = total - active
        activeEth = (totalEth * lambdaBps) / 10_000;
        activeUsdc = (totalUsdc * lambdaBps) / 10_000;
        passiveEth = totalEth - activeEth;
        passiveUsdc = totalUsdc - activeUsdc;

        // epoch capacity budget for Cadence slots = active ETH depth
        uint256 expired = epochCapacityEth[epochId] > 0 ? epochCapacityEth[epochId] - _soldCapacityEth() : 0;
        epochCapacityEth[epochId] = activeEth;

        emit EpochRefreshed(epochId, activeEth, activeUsdc, passiveEth, passiveUsdc);
        emit EpochCapacitySet(epochId, activeEth, passiveEth);
        if (expired > 0) emit CapacityExpired(epochId, expired);
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
        // update ACTIVE reserves; passive untouched — locked until refresh.
        // Marks the epoch as consumed so seeds can no longer re-partition.
        consumedThisEpoch = true;
        if (zeroForOne) {
            activeEth -= size;
            activeUsdc -= out;
        } else {
            activeUsdc -= size;
            activeEth -= out;
        }

        // swap fee — a SEPARATE ledger from slot-sale revenue: 0.30% of the
        // output stays with the hook and accrues to LPs pro-rata by shares.
        uint256 fee = (out * swapFeeBps) / 10_000;
        if (fee > 0 && totalShares > 0) {
            feeAccPerShare += (fee * 1e18) / totalShares;
        } else {
            fee = 0;
        }

        // settle the custom delta: pull input from the manager (the router
        // paid it in before swap), push output into the manager for the
        // router to deliver (net of the LP swap fee). Pool swap is no-oped.
        inputC.take(manager, address(this), size, false);
        outputC.settle(manager, address(this), out - fee, false);

        // hook delta: +size specified (hook owed input), -out unspecified
        // (hook owes output). Swapper nets (-size, +out) after Hooks.afterSwap.
        // (int128 casts are safe: size is bounded below.)
        require(size < 2 ** 127, "CadenceHook: size overflow");
        BeforeSwapDelta hookDelta = toBeforeSwapDelta(int128(uint128(size)), -int128(int256(out - fee)));

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

    /// @notice Net quote: active-only constant product minus the LP swap fee.
    ///         The fee waives while there are no LPs (nothing to accrue to).
    function quoteOutUsdc(uint256 sizeEth) external view returns (uint256) {
        uint256 gross = _quoteOut(activeEth, activeUsdc, sizeEth);
        return totalShares > 0 ? gross - (gross * swapFeeBps) / 10_000 : gross;
    }

    /// @notice The hook custodies raw reserves (seeds and swap inflows land
    ///         here); native ETH enters via manager.take during swaps and
    ///         via seedEth. ETH from CadenceSlots is slot-sale revenue.
    receive() external payable {
        if (msg.sender == slots) {
            // §8 split: protocol cut accrues to the treasury ledger; the LP
            // pool accrues pro-rata by shares. Two ledgers, never mixed.
            uint256 cut = (msg.value * protocolTakeBps) / 10_000;
            accruedProtocolRevenue += cut;
            _accrueSlotRevenue(msg.value - cut);
        }
    }
}

interface CadenceSlotsLike {
    function slotOf(address owner) external view returns (uint256);
    function consume(address trader, uint256 size) external;
    function revealAndConsume(address trader, uint256 size, bytes32 salt) external returns (uint256);
    function mintedCapacity(uint256 epochId) external view returns (uint256);
    function committedCapacity(uint256 epochId) external view returns (uint256);
}
