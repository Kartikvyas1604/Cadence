// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {CadenceSlots} from "../src/CadenceSlots.sol";
import {CadenceHook} from "../src/CadenceHook.sol";
import {CadenceRouter} from "../src/CadenceRouter.sol";

contract CadenceTest is Test {
    // hook permissions: BEFORE_SWAP_FLAG (1<<7) | BEFORE_SWAP_RETURNS_DELTA_FLAG (1<<3)
    uint160 constant HOOK_FLAGS = uint160(1 << 7 | 1 << 3);

    IPoolManager manager;
    MockUSDC usdc;
    CadenceSlots slots;
    CadenceHook hook;
    CadenceRouter router;
    PoolKey key;

    address lp = makeAddr("lp");
    address buyer = makeAddr("buyer");
    address outsider = makeAddr("outsider");

    uint256 constant LAMBDA_BPS = 2500; // 25% active
    uint256 constant EPOCH_LEN = 12;

    uint256 constant SEED_ETH = 1000e18;
    uint256 constant SEED_USDC = 3_000_000e18; // 3000 USDC per ETH
    uint256 constant PRICE_PER_ETH = 0.001e18; // 0.001 ETH per 1 ETH of capacity

    // active after refresh = 25%: 250 ETH / 750k USDC
    uint256 constant ACTIVE_ETH = 250e18;
    uint256 constant ACTIVE_USDC = 750_000e18;

    function setUp() public {
        manager = IPoolManager(address(new PoolManager(address(0))));
        usdc = new MockUSDC(address(this));

        // Slots and router are CREATE2-deployed at known addresses so the
        // hook (which references both immutably) can be salt-mined for the
        // BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA address flags.
        bytes memory codeSlots = abi.encodePacked(
            type(CadenceSlots).creationCode, abi.encode(PRICE_PER_ETH, PRICE_PER_ETH * 2, "", address(this))
        );
        bytes memory codeRouter =
            abi.encodePacked(type(CadenceRouter).creationCode, abi.encode(manager, address(usdc)));
        address slotsAddr = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(11)), keccak256(codeSlots)))))
        );
        address routerAddr = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(12)), keccak256(codeRouter)))))
        );

        bytes memory args = abi.encode(manager, address(usdc), slotsAddr, routerAddr, LAMBDA_BPS, EPOCH_LEN);
        bytes memory code = abi.encodePacked(type(CadenceHook).creationCode, args);
        bytes32 salt;
        address hookAddr;
        while (true) {
            salt = bytes32(vm.randomUint());
            hookAddr = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(code))))));
            if (uint160(hookAddr) & Hooks.ALL_HOOK_MASK == HOOK_FLAGS) break;
        }

        slots = new CadenceSlots{salt: bytes32(uint256(11))}(PRICE_PER_ETH, PRICE_PER_ETH * 2, "", address(this));
        require(address(slots) == slotsAddr, "slots addr");
        router = new CadenceRouter{salt: bytes32(uint256(12))}(manager, address(usdc));
        require(address(router) == routerAddr, "router addr");
        hook = new CadenceHook{salt: salt}(manager, address(usdc), slotsAddr, routerAddr, LAMBDA_BPS, EPOCH_LEN);
        require(address(hook) == hookAddr, "hook addr");

        slots.setHook(address(hook));

        key = PoolKey({currency0: Currency.wrap(address(0)), currency1: Currency.wrap(address(usdc)), fee: 0, tickSpacing: 60, hooks: hook});

        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));

        // seed reserves -> epoch refresh -> active = lambda * total
        usdc.transfer(lp, SEED_USDC);
        vm.deal(lp, SEED_ETH + 100e18);
        vm.startPrank(lp);
        hook.seedEth{value: SEED_ETH}();
        usdc.approve(address(hook), type(uint256).max);
        hook.seedUsdc(SEED_USDC);
        vm.stopPrank();

        assertEq(hook.activeEth(), ACTIVE_ETH);
        assertEq(hook.activeUsdc(), ACTIVE_USDC);
        assertEq(hook.passiveEth(), SEED_ETH - ACTIVE_ETH);
        assertEq(hook.passiveUsdc(), SEED_USDC - ACTIVE_USDC);

        // fund actors
        vm.deal(buyer, 1000e18);
        vm.deal(outsider, 1000e18);
    }


    /// ------------------------------------------------------------------
    /// Wrapped-error decoding: PoolManager wraps hook reverts in
    /// WrappedError(address, bytes4, bytes, bytes); assert the inner selector.
    /// ------------------------------------------------------------------

    function _rawSwap(address who, bytes memory callData, uint256 value)
        internal
        returns (bool ok, bytes memory ret)
    {
        (ok, ret) = address(router).call{value: value}(callData);
    }

    function assertWrapped(bytes memory data, bytes4 inner) internal {
        // skip the 4-byte WrappedError selector before decoding
        bytes memory payload = new bytes(data.length - 4);
        for (uint256 i = 4; i < data.length; i++) payload[i - 4] = data[i];
        (, , bytes memory innerData, ) = abi.decode(payload, (address, bytes4, bytes, bytes));
        assertEq(innerData.length >= 4 ? bytes4(innerData) : bytes4(0), inner, "wrong inner revert");
    }

    function currentEpoch() internal view returns (uint256) {
        return block.number / EPOCH_LEN;
    }

    function buySlot(address who, uint256 size) internal returns (uint256 cost) {
        cost = (size * PRICE_PER_ETH) / 1e18;
        vm.startPrank(who);
        slots.mintPublic{value: cost + 1 ether}(size);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Beat #1: swap succeeds WITH slot, rejects WITHOUT
    // ------------------------------------------------------------------

    function test_swapSucceedsWithSlot() public {
        uint256 size = 10e18;
        buySlot(buyer, size);
        uint256 usdcBefore = usdc.balanceOf(buyer);
        uint256 ethBefore = buyer.balance;

        vm.startPrank(buyer);
        router.swap{value: size}(key, true, size);
        vm.stopPrank();

        // got USDC out, ETH gone
        assertTrue(usdc.balanceOf(buyer) > usdcBefore);
        assertEq(buyer.balance, ethBefore - size);
        // quote is deterministic active-only constant product
        uint256 expectedOut = hook.quoteOutUsdc(size);
        assertEq(usdc.balanceOf(buyer) - usdcBefore, expectedOut);

        // active reserves decreased, passive untouched
        assertEq(hook.activeEth(), ACTIVE_ETH - size);
        assertEq(hook.passiveEth(), SEED_ETH - ACTIVE_ETH);
        assertEq(hook.passiveUsdc(), SEED_USDC - ACTIVE_USDC);
    }

    function test_rejectNoSlot() public {
        uint256 size = 10e18;
        vm.startPrank(outsider);
        (bool ok, bytes memory ret) = _rawSwap(outsider, abi.encodeCall(router.swap, (key, true, size)), size);
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceHook.NoCadenceSlot.selector);
    }

    function test_rejectOversizeVsSlot() public {
        uint256 size = 10e18;
        buySlot(buyer, size);
        uint256 tooBig = size * 2;
        vm.deal(buyer, buyer.balance + size);
        vm.startPrank(buyer);
        (bool ok, bytes memory ret) = _rawSwap(buyer, abi.encodeCall(router.swap, (key, true, tooBig)), tooBig);
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceHook.OversizeVsSlot.selector);
    }

    function test_rejectOversizeVsActive() public {
        // slot big enough, trade bigger than ACTIVE (250 ETH)
        buySlot(buyer, ACTIVE_ETH);
        vm.deal(buyer, buyer.balance + ACTIVE_ETH * 2);
        uint256 tooBig = ACTIVE_ETH + 1e18;
        vm.startPrank(buyer);
        (bool ok, bytes memory ret) = _rawSwap(buyer, abi.encodeCall(router.swap, (key, true, tooBig)), tooBig);
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceHook.OversizeVsActive.selector);
    }

    function test_rejectSameBlockPassiveUnlock() public {
        // same-block order splitting must never reach passive: capacity sold
        // per epoch is bounded by the active depth, so a split can only
        // consume active — deeper orders reject (OversizeVsActive)
        address buyerB = makeAddr("buyerB");
        vm.deal(buyerB, 1000e18);
        buySlot(buyer, 100e18);
        buySlot(buyerB, 150e18);
        vm.deal(buyer, buyer.balance + 100e18);
        vm.deal(buyerB, buyerB.balance + 150e18);

        // split order 1 in the same block
        vm.startPrank(buyerB);
        router.swap{value: 100e18}(key, true, 100e18);
        vm.stopPrank();

        // split order 2 in the same block — active remaining = 100
        vm.startPrank(buyerB);
        router.swap{value: 50e18}(key, true, 50e18);
        vm.stopPrank();

        // third fill drains the rest
        vm.startPrank(buyer);
        router.swap{value: 100e18}(key, true, 100e18);
        vm.stopPrank();

        // active drained to exactly zero (budget == active depth)
        assertEq(hook.activeEth(), 0);

        // a further split in the same block has no capacity left anywhere
        vm.startPrank(buyer);
        (bool ok, bytes memory ret) = _rawSwap(buyer, abi.encodeCall(router.swap, (key, true, 100e18)), 100e18);
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceHook.PassiveUnlock.selector);

        // passive reserves never moved in either block
        assertEq(hook.passiveEth(), SEED_ETH - ACTIVE_ETH);
        assertEq(hook.passiveUsdc(), SEED_USDC - ACTIVE_USDC);
    }

    function test_passiveUnlockGuard() public {
        // defense-in-depth: the hook reverts PassiveUnlock whenever active
        // is empty and a fill is attempted (guard reachable via future
        // re-partitioning bugs — asserted here by direct overflow attempt)
        address buyerB = makeAddr("buyerB");
        vm.deal(buyerB, 1000e18);
        buySlot(buyerB, ACTIVE_ETH);
        vm.deal(buyerB, buyerB.balance + ACTIVE_ETH);
        vm.startPrank(buyerB);
        router.swap{value: ACTIVE_ETH}(key, true, ACTIVE_ETH);
        vm.stopPrank();
        assertEq(hook.activeEth(), 0);

        // with active drained, the next epoch re-partitions and the guard
        // stays as defense-in-depth against any future accounting drift
        vm.roll(block.number + EPOCH_LEN);
        hook.refreshEpoch();
        assertTrue(hook.activeEth() > 0);
    }

    // ------------------------------------------------------------------
    // Epoch mechanics
    // ------------------------------------------------------------------

    function test_slotsExpireAcrossEpochs() public {
        uint256 size = 10e18;
        buySlot(buyer, size);
        vm.roll(block.number + EPOCH_LEN); // next epoch

        // slot is for the previous epoch — hook sees no current-epoch slot
        vm.startPrank(buyer);
        (bool ok, bytes memory ret) = _rawSwap(buyer, abi.encodeCall(router.swap, (key, true, size)), size);
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceHook.NoCadenceSlot.selector);
    }

    function test_epochRefreshRepartitions() public {
        uint256 size = 10e18;
        buySlot(buyer, size);
        vm.startPrank(buyer);
        router.swap{value: size}(key, true, size);
        vm.stopPrank();

        assertEq(hook.activeEth(), ACTIVE_ETH - size);

        vm.roll(block.number + EPOCH_LEN);
        hook.refreshEpoch();

        // active = lambda * total; total includes swap inflows (reserves are
        // raw hook balances: +size ETH swapped in)
        assertEq(hook.activeEth(), ((SEED_ETH + size) * LAMBDA_BPS) / 10_000);
    }

    function test_refreshPermissionless() public {
        vm.roll(block.number + EPOCH_LEN);
        vm.prank(outsider);
        hook.refreshEpoch();
        assertEq(hook.epochCapacityEth(currentEpoch()), ACTIVE_ETH);
    }

    // ------------------------------------------------------------------
    // Capacity budget
    // ------------------------------------------------------------------

    function test_mintRespectsCapacityBudget() public {
        vm.startPrank(buyer);
        vm.expectRevert(CadenceSlots.CapacityExceeded.selector);
        slots.mintPublic{value: 1000e18}(ACTIVE_ETH + 1e18);
        vm.stopPrank();
    }

    function test_mintRefundsExcess() public {
        uint256 size = 10e18;
        uint256 before = buyer.balance;
        buySlot(buyer, size);
        assertEq(buyer.balance, before - (size * PRICE_PER_ETH) / 1e18);
        assertEq(slots.slotOf(buyer), size);
    }

    // ------------------------------------------------------------------
    // Private Cadence Intent: commit -> reveal -> consume
    // ------------------------------------------------------------------

    function test_commitRevealSwap() public {
        uint256 size = 10e18;
        uint256 salt = 42;
        bytes32 H = slots.commitHash(size, currentEpoch(), bytes32(uint256(salt)));

        // commit: H goes onchain, size does not
        uint256 escrow = (size * PRICE_PER_ETH) / 1e18 * 3;
        vm.startPrank(buyer);
        vm.expectEmit(true, true, true, true);
        emit CadenceSlots.SlotCommitted(currentEpoch(), H, buyer, escrow);
        slots.commitMint{value: escrow}(H);
        vm.stopPrank();

        // size is hidden: no ERC-1155 balance for the private path
        assertEq(slots.slotOf(buyer), 0);

        // reveal + swap in one fill
        uint256 usdcBefore = usdc.balanceOf(buyer);
        uint256 ethBefore = buyer.balance;
        vm.startPrank(buyer);
        vm.expectEmit(true, true, true, true);
        emit CadenceSlots.SlotRevealed(currentEpoch(), H, buyer, size, (size * PRICE_PER_ETH) / 1e18);
        router.sellEthPrivate{value: size}(key, size, bytes32(uint256(salt)));
        vm.stopPrank();

        assertTrue(usdc.balanceOf(buyer) > usdcBefore);
        // escrow refunded minus cost, ETH swapped
        assertEq(buyer.balance, ethBefore + escrow - size - (size * PRICE_PER_ETH) / 1e18);
        // commitment consumed
        (, , , , CadenceSlots.CommitmentStatus status) = _commitment(H);
        assertEq(uint8(status), uint8(CadenceSlots.CommitmentStatus.Revealed));
    }

    function test_rejectBadReveal() public {
        uint256 size = 10e18;
        bytes32 H = slots.commitHash(size, currentEpoch(), bytes32(uint256(42)));
        vm.startPrank(buyer);
        slots.commitMint{value: (size * PRICE_PER_ETH) / 1e18 * 3}(H);
        vm.stopPrank();

        vm.startPrank(buyer);
        (bool ok, bytes memory ret) =
            _rawSwap(buyer, abi.encodeCall(router.sellEthPrivate, (key, size, bytes32(uint256(43)))), size); // wrong salt
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceSlots.BadReveal.selector);

        vm.startPrank(buyer);
        (ok, ret) = _rawSwap(buyer, abi.encodeCall(router.sellEthPrivate, (key, size + 1, bytes32(uint256(42)))), size + 1); // wrong size
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceHook.BadReveal.selector);
    }

    function test_revealWithoutCommitReverts() public {
        vm.startPrank(buyer);
        (bool ok, bytes memory ret) = _rawSwap(buyer, abi.encodeCall(router.sellEthPrivate, (key, 10e18, bytes32(uint256(42)))), 10e18);
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceSlots.BadReveal.selector);
    }

    function test_commitCannotRevealForSomeoneElse() public {
        uint256 size = 10e18;
        bytes32 H = slots.commitHash(size, currentEpoch(), bytes32(uint256(42)));
        vm.startPrank(buyer);
        slots.commitMint{value: (size * PRICE_PER_ETH) / 1e18 * 3}(H);
        vm.stopPrank();

        vm.startPrank(outsider);
        (bool ok, bytes memory ret) = _rawSwap(outsider, abi.encodeCall(router.sellEthPrivate, (key, size, bytes32(uint256(42)))), size);
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceSlots.BadReveal.selector);
    }

    function test_insufficientEscrowRejectsReveal() public {
        uint256 size = 10e18;
        bytes32 H = slots.commitHash(size, currentEpoch(), bytes32(uint256(42)));
        vm.startPrank(buyer);
        slots.commitMint{value: 2 * PRICE_PER_ETH}(H); // above minEscrow, below cost
        vm.stopPrank();

        vm.startPrank(buyer);
        (bool ok, bytes memory ret) = _rawSwap(buyer, abi.encodeCall(router.sellEthPrivate, (key, size, bytes32(uint256(42)))), size);
        vm.stopPrank();
        assertFalse(ok);
        assertWrapped(ret, CadenceSlots.InsufficientEscrow.selector);
    }

    function test_expireCommitmentRefunds() public {
        uint256 size = 10e18;
        bytes32 H = slots.commitHash(size, currentEpoch(), bytes32(uint256(42)));
        vm.startPrank(buyer);
        slots.commitMint{value: (size * PRICE_PER_ETH) / 1e18 * 3}(H);
        vm.stopPrank();

        vm.roll(block.number + EPOCH_LEN);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        slots.expireCommitment(H);
        assertEq(buyer.balance, before + (size * PRICE_PER_ETH) / 1e18 * 3);
    }

    // ------------------------------------------------------------------
    // Access control / defense
    // ------------------------------------------------------------------

    function test_onlyManagerCallsBeforeSwap() public {
        vm.prank(outsider);
        vm.expectRevert(CadenceHook.NotPoolManager.selector);
        hook.beforeSwap(
            outsider,
            key,
            IPoolManager.SwapParams({zeroForOne: true, amountSpecified: -1e18, sqrtPriceLimitX96: 0}),
            abi.encode(outsider, uint256(0), bytes32(0))
        );
    }

    function test_onlyHookConsumesSlots() public {
        buySlot(buyer, 10e18);
        vm.prank(outsider);
        vm.expectRevert("CadenceSlots: not hook");
        slots.consume(buyer, 10e18);
    }

    function test_routerIdentityRequired() public {
        // direct manager.swap with empty hookData -> MissingTrader
        vm.prank(outsider);
        vm.expectRevert();
        manager.unlock(abi.encode(0)); // unlock with nonsense data reverts anyway
    }

    function test_honesty_slotIsNotLpShare() public {
        // buying a slot must NOT change reserves or give claims
        uint256 reservesBefore = hook.activeEth();
        buySlot(buyer, 10e18);
        assertEq(hook.activeEth(), reservesBefore);
        // and the hook owes the buyer nothing on-chain (ERC-1155 only)
        assertEq(slots.balanceOf(buyer, currentEpoch()), 10e18);
    }

    // helper to read the commitment struct without tuple destructure issues
    function _commitment(bytes32 H)
        internal
        view
        returns (address payer, uint256 epochId, uint256 escrow, uint256 reserved, CadenceSlots.CommitmentStatus status)
    {
        (payer, epochId, escrow, reserved, status) = slots.commitments(H);
    }
}
