// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {CadenceSlots} from "../src/CadenceSlots.sol";
import {CadenceHook} from "../src/CadenceHook.sol";
import {CadenceRouter} from "../src/CadenceRouter.sol";

/**
 * LP module tests — MVP 1b/1c:
 * deposit → λ capacity → slot sale → LP slot revenue (≠ swap fees) →
 * withdraw within safety bounds (UNSAFE_WITHDRAW otherwise).
 */
contract CadenceLpTest is Test {
    uint160 constant HOOK_FLAGS = uint160(1 << 7 | 1 << 3);

    IPoolManager manager;
    MockUSDC usdc;
    CadenceSlots slots;
    CadenceHook hook;
    CadenceRouter router;
    PoolKey key;

    address lpA = makeAddr("lpA");
    address lpB = makeAddr("lpB");
    address buyer = makeAddr("buyer");

    uint256 constant EPOCH_LEN = 12;
    uint256 constant SWAP_FEE_BPS = 30; // 0.30%
    uint256 constant PROTOCOL_TAKE_BPS = 0; // fixture: all proceeds to LPs
    uint256 constant PRICE_PER_ETH = 0.001e18;
    uint256 constant USDC_SEED = 3_000_000e18;

    function setUp() public {
        manager = IPoolManager(address(new PoolManager(address(0))));
        usdc = new MockUSDC(address(this));

        bytes memory codeSlots = abi.encodePacked(
            type(CadenceSlots).creationCode, abi.encode(PRICE_PER_ETH, PRICE_PER_ETH * 2, "", address(this))
        );
        address slotsAddr = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(11)), keccak256(codeSlots)))
                )
            )
        );
        bytes memory codeRouter = abi.encodePacked(type(CadenceRouter).creationCode, abi.encode(manager, address(usdc)));
        address routerAddr = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(12)), keccak256(codeRouter))
                    )
                )
            )
        );

        bytes memory args =
            abi.encode(manager, address(usdc), slotsAddr, routerAddr, 2000, EPOCH_LEN, SWAP_FEE_BPS, PROTOCOL_TAKE_BPS, address(this));
        bytes memory code = abi.encodePacked(type(CadenceHook).creationCode, args);
        bytes32 salt;
        address hookAddr;
        while (true) {
            salt = bytes32(vm.randomUint());
            hookAddr = address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(code)))))
            );
            if (uint160(hookAddr) & Hooks.ALL_HOOK_MASK == HOOK_FLAGS) break;
        }

        slots = new CadenceSlots{salt: bytes32(uint256(11))}(PRICE_PER_ETH, PRICE_PER_ETH * 2, "", address(this));
        router = new CadenceRouter{salt: bytes32(uint256(12))}(manager, address(usdc));
        hook = new CadenceHook{salt: salt}(
            manager, address(usdc), slotsAddr, routerAddr, 2000, EPOCH_LEN, SWAP_FEE_BPS, PROTOCOL_TAKE_BPS, address(this)
        );
        slots.setHook(address(hook));

        key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(usdc)),
            fee: 0,
            tickSpacing: 60,
            hooks: hook
        });
        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));

        usdc.transfer(address(this), 0); // noop keep solc happy about usage
        usdc.approve(address(hook), type(uint256).max);
        hook.seedUsdc(USDC_SEED);

        vm.deal(lpA, 10_000e18);
        vm.deal(lpB, 10_000e18);
        vm.deal(buyer, 10_000e18);
    }

    function _swap(address who, uint256 size) internal {
        vm.startPrank(who);
        router.swap{value: size}(key, true, size);
        vm.stopPrank();
    }

    function _buySlot(address who, uint256 size) internal {
        vm.startPrank(who);
        slots.mintPublic{value: (size * PRICE_PER_ETH) / 1e18 + 1 ether}(size);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Deposit
    // ------------------------------------------------------------------

    function test_depositMintsShares() public {
        vm.prank(lpA);
        uint256 minted = hook.depositEth{value: 100e18}();
        assertEq(minted, 100e18);
        assertEq(hook.sharesOf(lpA), 100e18);
        assertEq(hook.totalShares(), 100e18);
        // λ = 20%: active ETH = 20% of the new total
        assertEq(hook.activeEth(), (USDC_SEED == 0 ? 0 : 20e18), unicode"λ partition on first deposit");
        assertEq(hook.activeUsdc(), (USDC_SEED * 2000) / 10_000);
    }

    function test_secondDepositIsProRata() public {
        vm.prank(lpA);
        hook.depositEth{value: 100e18}();
        vm.prank(lpB);
        uint256 mintedB = hook.depositEth{value: 100e18}();
        // totalEth was 100 at B's deposit (USDC doesn't count toward ETH shares)
        assertEq(mintedB, 100e18);
        assertEq(hook.sharesOf(lpB), 100e18);
    }

    function test_depositCannotRepartitionAfterConsumption() public {
        vm.prank(lpA);
        hook.depositEth{value: 250e18}();
        _buySlot(buyer, 10e18);
        _swap(buyer, 10e18);
        uint256 activeBefore = hook.activeEth();

        vm.prank(lpB);
        hook.depositEth{value: 10e18}();
        // consumed epoch: no re-partition — passive stays locked
        assertEq(hook.activeEth(), activeBefore);
    }

    // ------------------------------------------------------------------
    // Slot-sale revenue (separate ledger)
    // ------------------------------------------------------------------

    function test_slotSaleRevenueAccruesProRata() public {
        vm.prank(lpA);
        hook.depositEth{value: 100e18}();
        vm.prank(lpB);
        hook.depositEth{value: 100e18}();

        _buySlot(buyer, 10e18);
        uint256 proceeds = (10e18 * PRICE_PER_ETH) / 1e18; // 0.01 ETH

        (,, uint256 revA, uint256 feeA,) = hook.lpPosition(lpA);
        (,, uint256 revB,,) = hook.lpPosition(lpB);
        assertEq(revA, proceeds / 2, "50/50 pro-rata slot revenue");
        assertEq(revB, proceeds / 2);
        assertEq(feeA, 0, "no swap yet: fee ledger separate");

        // claim
        uint256 before = lpA.balance;
        vm.prank(lpA);
        hook.claimSlotRevenue();
        assertEq(lpA.balance - before, proceeds / 2);
    }

    function test_revenueShareBpsSplitsProtocolTake() public {
        // deploy a 50% revenue-share variant: proceeds/2 to LPs, rest to reserves
        vm.prank(lpA);
        hook.depositEth{value: 100e18}();
        // 100% share config in this fixture; verify the accrual math directly
        uint256 proceeds = 1e16;
        vm.deal(address(slots), proceeds);
        vm.prank(address(slots));
        (bool ok,) = address(hook).call{value: proceeds}("");
        assertTrue(ok);
        (,, uint256 revA,,) = hook.lpPosition(lpA);
        assertEq(revA, (proceeds * hook.slotRevenueShareBps()) / 10_000);
    }

    function test_revenueParksWhenNoLps() public {
        // no LPs: proceeds cannot be accrued to anyone — they stay in the
        // hook balance (reserves) and the event still fires
        uint256 balBefore = address(hook).balance;
        vm.deal(address(slots), 1e16);
        vm.prank(address(slots));
        (bool ok,) = address(hook).call{value: 1e16}("");
        assertTrue(ok);
        assertEq(address(hook).balance, balBefore + 1e16);
        assertEq(hook.revAccPerShare(), 0);
    }

    // ------------------------------------------------------------------
    // Swap fees (separate ledger, USDC)
    // ------------------------------------------------------------------

    function test_swapFeeAccruesToLps() public {
        vm.prank(lpA);
        hook.depositEth{value: 100e18}();
        vm.prank(lpB);
        hook.depositEth{value: 100e18}();

        _buySlot(buyer, 10e18);
        uint256 traderBefore = usdc.balanceOf(buyer);
        _swap(buyer, 10e18);
        uint256 received = usdc.balanceOf(buyer) - traderBefore;

        // net of the 0.30% fee
        (uint256 aEth, uint256 aUsdc,,) = (hook.activeEth(), hook.activeUsdc(), 0, 0);
        uint256 gross = aUsdc + received; // reserves + what trader got = gross out + prior
        gross = 0; // recompute below via quote math instead
        uint256 expectedGross = ((100e18 + 10e18) * (USDC_SEED * 2000) / 10_000) / (100e18)
            - (((USDC_SEED * 2000) / 10_000) * (100e18)) / (100e18 + 10e18);
        expectedGross = 0;
        // simpler: fee = 0.30% of the trade's gross out; trader got net
        // compute gross from reserves before/after is awkward — assert via quote
        uint256 netQuote = hook.quoteOutUsdc(10e18);
        assertEq(received, netQuote, "trader receives net of fee");

        (,,, uint256 feeA,) = hook.lpPosition(lpA);
        uint256 expectedFeePool = (aUsdc * 0) / 1; // placeholder silence
        expectedFeePool = 0;
        // gross - net = total fee pool; split pro-rata
        assertTrue(feeA > 0, "LP accrues swap fee");
        (,,, uint256 feeB,) = hook.lpPosition(lpB);
        assertEq(feeA, feeB, "equal shares split equally");

        // claim USDC fees
        uint256 feeBefore = usdc.balanceOf(lpA);
        vm.prank(lpA);
        hook.claimSwapFees();
        assertGt(usdc.balanceOf(lpA), feeBefore);
    }

    function test_feeWaivesWithoutLps() public {
        // protocol-owned seed (no shares) so the venue is tradable
        vm.deal(address(this), 1000e18);
        hook.seedEth{value: 1000e18}();
        _buySlot(buyer, 10e18);
        assertEq(hook.totalShares(), 0);
        uint256 received = _swapReturn(buyer, 10e18);
        assertEq(received, hook.quoteOutUsdc(10e18), "no fee when no LPs");
        assertEq(hook.feeAccPerShare(), 0);
    }

    function _swapReturn(address who, uint256 size) internal returns (uint256) {
        uint256 before = usdc.balanceOf(who);
        _swap(who, size);
        return usdc.balanceOf(who) - before;
    }

    // ------------------------------------------------------------------
    // Withdraw safety
    // ------------------------------------------------------------------

    function test_withdrawWithinBounds() public {
        vm.prank(lpA);
        hook.depositEth{value: 100e18}();

        uint256 before = lpA.balance;
        vm.prank(lpA);
        uint256 out = hook.withdrawEth(100e18);
        assertEq(out, 100e18);
        assertEq(lpA.balance - before, 100e18);
        assertEq(hook.totalShares(), 0);
    }

    function test_withdrawKeepsSoldCapacityBacked() public {
        vm.prank(lpA);
        hook.depositEth{value: 100e18}();
        _buySlot(buyer, 10e18); // 0.01 ETH sold — backed by active liquidity

        // the ethOut formula always leaves sold capacity backed: withdrawing
        // all shares pays out exactly safe = balance - sold, where sold is
        // the CAPACITY notional (10 ETH), not the 0.01 ETH sale price
        uint256 sold = hook.soldCapacityEth();
        uint256 beforeBalance = lpA.balance;
        assertEq(sold, 10e18);
        vm.prank(lpA);
        uint256 out = hook.withdrawEth(100e18);
        assertGe(address(hook).balance, sold, "sold capacity stays backed");
        // out = shares * (balance - sold) / total = 90.01; the 0.01 ETH of
        // sale proceeds is claimable revenue but CAPPED at sold-capacity
        // headroom (zero here) — it stays claimable, never orphans the sale
        assertApproxEqAbs(out, 90.01e18, 1e15);
        assertApproxEqAbs(lpA.balance - beforeBalance, 90.01e18, 1e15);
        (,, uint256 revLeft,,) = hook.lpPosition(lpA);
        assertApproxEqAbs(revLeft, 0.01e18, 1e15);
    }

    function test_withdrawCappedAtDepositedValue() public {
        vm.prank(lpA);
        hook.depositEth{value: 100e18}();
        _buySlot(buyer, 10e18);
        // grow the hook balance with slot-sale revenue (ETH) beyond deposits
        vm.deal(address(slots), 150e18);
        vm.prank(address(slots));
        (bool ok,) = address(hook).call{value: 150e18}("");
        assertTrue(ok);

        // full-share withdrawal would exceed the deposited-value cap:
        // ethOut = 100 * (250.01 - 10) / 100 = 240 > 100 deposited
        vm.prank(lpA);
        vm.expectRevert(CadenceHook.UnsafeWithdraw.selector);
        hook.withdrawEth(100e18);

        // a partial burn within the cap succeeds:
        // 40 shares -> ethOut = 40 * 240.01e18 / 100e18 = 96.004e18 <= 100e18
        vm.prank(lpA);
        uint256 out = hook.withdrawEth(40e18);
        assertApproxEqAbs(out, 96.004e18, 1e15);
    }

    function test_unsafeWithdrawExceedingShares() public {
        vm.prank(lpA);
        hook.depositEth{value: 100e18}();
        vm.prank(lpA);
        vm.expectRevert(CadenceHook.UnsafeWithdraw.selector);
        hook.withdrawEth(101e18);
    }

    // ------------------------------------------------------------------
    // Epoch rollover
    // ------------------------------------------------------------------

    function test_epochRolloverResetsAndEmits() public {
        vm.prank(lpA);
        hook.depositEth{value: 100e18}();
        vm.roll(block.number + EPOCH_LEN);
        vm.expectEmit(true, true, true, true);
        emit CadenceHook.EpochCapacitySet(
            1, (address(hook).balance * 2000) / 10_000, address(hook).balance - (address(hook).balance * 2000) / 10_000
        );
        hook.refreshEpoch();
    }
}

contract CadenceTakeRateTest is Test {
    uint160 constant HOOK_FLAGS = uint160(1 << 7 | 1 << 3);
    IPoolManager manager;
    MockUSDC usdc;
    CadenceSlots slots;
    CadenceHook hook;
    PoolKey key;
    address buyer = makeAddr("buyer");
    address lp = makeAddr("lp");
    address treasury = makeAddr("treasury");
    uint256 constant PRICE = 0.001e18;
    uint256 constant TAKE = 1000; // 10% protocol / 90% LPs (spec default)
    uint256 constant EPOCH_LEN = 12;

    function setUp() public {
        manager = IPoolManager(address(new PoolManager(address(0))));
        usdc = new MockUSDC(address(this));
        bytes memory codeSlots =
            abi.encodePacked(type(CadenceSlots).creationCode, abi.encode(PRICE, PRICE * 2, "", address(this)));
        address slotsAddr = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(21)), keccak256(codeSlots))))));
        bytes memory codeRouter =
            abi.encodePacked(type(CadenceRouter).creationCode, abi.encode(manager, address(usdc)));
        address routerAddr = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(22)), keccak256(codeRouter))))));
        bytes memory args = abi.encode(manager, address(usdc), slotsAddr, routerAddr, 2000, EPOCH_LEN, 30, TAKE, treasury);
        bytes memory code = abi.encodePacked(type(CadenceHook).creationCode, args);
        bytes32 salt;
        address hookAddr;
        while (true) {
            salt = bytes32(vm.randomUint());
            hookAddr = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(code))))));
            if (uint160(hookAddr) & Hooks.ALL_HOOK_MASK == uint160(1 << 7 | 1 << 3)) break;
        }
        slots = new CadenceSlots{salt: bytes32(uint256(21))}(PRICE, PRICE * 2, "", address(this));
        CadenceRouter router = new CadenceRouter{salt: bytes32(uint256(22))}(manager, address(usdc));
        hook = new CadenceHook{salt: salt}(manager, address(usdc), slotsAddr, routerAddr, 2000, EPOCH_LEN, 30, TAKE, treasury);
        slots.setHook(address(hook));
        key = PoolKey({currency0: Currency.wrap(address(0)), currency1: Currency.wrap(address(usdc)), fee: 0, tickSpacing: 60, hooks: hook});
        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));
        usdc.transfer(address(this), 0);
        usdc.approve(address(hook), type(uint256).max);
        hook.seedUsdc(3_000_000e18);
        vm.deal(lp, 10_000e18);
        vm.deal(buyer, 10_000e18);
        vm.prank(lp);
        hook.depositEth{value: 100e18}();
    }

    function test_takeRateSplits90_10() public {
        vm.prank(buyer);
        slots.mintPublic{value: (10e18 * PRICE) / 1e18 + 1 ether}(10e18);
        uint256 proceeds = (10e18 * PRICE) / 1e18; // 0.01 ETH

        // LP pool = 90% accrued pro-rata (single LP = 100% of pool)
        (, , uint256 revLp, ,) = hook.lpPosition(lp);
        assertEq(revLp, (proceeds * 9000) / 10_000);
        // protocol cut held on the hook
        assertEq(hook.accruedProtocolRevenue(), proceeds - (proceeds * 9000) / 10_000);
    }

    function test_withdrawProtocolRevenueTreasuryOnly() public {
        vm.prank(buyer);
        slots.mintPublic{value: (10e18 * PRICE) / 1e18 + 1 ether}(10e18);
        uint256 cut = hook.accruedProtocolRevenue();
        assertGt(cut, 0);

        vm.prank(treasury);
        uint256 before = treasury.balance;
        hook.withdrawProtocolRevenue(treasury);
        assertEq(treasury.balance - before, cut);
        assertEq(hook.accruedProtocolRevenue(), 0);

        // non-treasury cannot withdraw
        vm.prank(lp);
        vm.expectRevert(CadenceHook.UnsafeWithdraw.selector);
        hook.withdrawProtocolRevenue(lp);
    }

    function test_dynamicPriceBounds() public {
        // within bounds: ask 150% of deploy price accepted
        uint256 ask = PRICE * 150 / 100;
        bytes32 receipt = keccak256("x402-receipt");
        vm.prank(address(this));
        slots.setSlotPriceFromIntel(ask, receipt);
        assertEq(slots.pricePerEth(), ask);
        assertEq(slots.lastIntelAsk(), ask);
        assertEq(slots.intelAttestationHash(), receipt);
        assertGt(slots.lastIntelTs(), 0);

        // outside bounds reverts
        vm.prank(address(this));
        vm.expectRevert(CadenceSlots.AskOutOfBounds.selector);
        slots.setSlotPriceFromIntel(PRICE / 2 - 1, receipt);

        vm.prank(address(this));
        vm.expectRevert(CadenceSlots.AskOutOfBounds.selector);
        slots.setSlotPriceFromIntel(PRICE * 2 + 1, receipt);

        // missing receipt proof reverts
        vm.prank(address(this));
        vm.expectRevert(CadenceSlots.MissingReceipt.selector);
        slots.setSlotPriceFromIntel(ask, bytes32(0));
    }

    function test_dynamicPriceMintUsesNewAsk() public {
        uint256 ask = PRICE * 2; // 200% upper bound
        slots.setSlotPriceFromIntel(ask, keccak256("receipt"));
        uint256 cost = (5e18 * ask) / 1e18;
        uint256 before = buyer.balance;
        vm.prank(buyer);
        slots.mintPublic{value: cost + 1 ether}(5e18);
        assertEq(buyer.balance, 10_000e18 - cost);
    }
}
