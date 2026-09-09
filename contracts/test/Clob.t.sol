// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {CadenceSlots} from "../src/CadenceSlots.sol";
import {CadenceHook} from "../src/CadenceHook.sol";
import {CadenceRouter} from "../src/CadenceRouter.sol";
import {Clob} from "../src/Clob.sol";

contract ClobTest is Test {
    uint160 constant HOOK_FLAGS = uint160(1 << 7 | 1 << 3);
    IPoolManager manager;
    MockUSDC usdc;
    CadenceSlots slots;
    CadenceHook hook;
    CadenceRouter router;
    Clob clob;
    PoolKey key;

    address maker = makeAddr("maker");
    address taker = makeAddr("taker");
    uint256 constant PRICE = 0.001e18;
    uint256 constant EPOCH_LEN = 12;

    function setUp() public {
        manager = IPoolManager(address(new PoolManager(address(0))));
        usdc = new MockUSDC(address(this));
        bytes memory codeSlots =
            abi.encodePacked(type(CadenceSlots).creationCode, abi.encode(PRICE, PRICE * 2, "", address(this)));
        address slotsAddr = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(31)), keccak256(codeSlots)))
                )
            )
        );
        bytes memory codeRouter = abi.encodePacked(type(CadenceRouter).creationCode, abi.encode(manager, address(usdc)));
        address routerAddr = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(32)), keccak256(codeRouter))
                    )
                )
            )
        );
        bytes memory args =
            abi.encode(manager, address(usdc), slotsAddr, routerAddr, 2000, EPOCH_LEN, 30, 1000, address(this));
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
        slots = new CadenceSlots{salt: bytes32(uint256(31))}(PRICE, PRICE * 2, "", address(this));
        CadenceRouter router0 = new CadenceRouter{salt: bytes32(uint256(32))}(manager, address(usdc));
        hook = new CadenceHook{salt: salt}(
            manager, address(usdc), slotsAddr, routerAddr, 2000, EPOCH_LEN, 30, 1000, address(this)
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
        usdc.approve(address(hook), type(uint256).max);
        hook.seedUsdc(3_000_000e18);
        hook.seedEth{value: 500e18}();

        clob = new Clob(address(hook), slots);
        vm.deal(maker, 10_000e18);
        vm.deal(taker, 10_000e18);
        vm.startPrank(maker);
        slots.mintPublic{value: (20e18 * PRICE) / 1e18 + 1 ether}(20e18);
        slots.setApprovalForAll(address(clob), true);
        vm.stopPrank();
    }

    function test_placeBuyEscrowsETH() public {
        uint256 balBefore = maker.balance;
        uint256 ep = clob.currentEpoch();
        vm.prank(maker);
        uint256 id = clob.placeOrder{value: 0.01e18 + 1 ether}(true, ep, 10e18, 0.001e18);
        assertEq(id, 1);
        // escrow = 10 * 0.001 = 0.01 ETH; excess refunded
        assertEq(maker.balance, 10_000e18 - 0.01e18 - (20e18 * PRICE) / 1e18);
        assertEq(address(clob).balance, 0.01e18);
    }

    function test_placeSellEscrowsSlots() public {
        uint256 ep = clob.currentEpoch();
        vm.prank(maker);
        uint256 id = clob.placeOrder(false, ep, 10e18, 0.001e18);
        assertEq(slots.balanceOf(address(clob), clob.currentEpoch()), 10e18);
        assertEq(slots.balanceOf(maker, clob.currentEpoch()), 10e18);
    }

    function test_cancelRefunds() public {
        uint256 ep = clob.currentEpoch();
        vm.prank(maker);
        uint256 id = clob.placeOrder{value: 0.01e18}(true, ep, 10e18, 0.001e18);
        uint256 before = maker.balance;
        vm.prank(maker);
        clob.cancelOrder(id);
        assertEq(maker.balance - before, 0.01e18);
        assertEq(address(clob).balance, 0);
    }

    function test_matchFillsAtomic() public {
        uint256 ep = clob.currentEpoch();
        vm.prank(maker);
        uint256 sellId = clob.placeOrder(false, ep, 10e18, 0.001e18);
        vm.prank(taker);
        uint256 buyId = clob.placeOrder{value: 0.01e18}(true, ep, 10e18, 0.001e18);

        uint256 sellerBefore = maker.balance;
        vm.prank(taker);
        clob.matchOrders(2, 1); // buy id 2, sell id 1
        // seller got escrowed ETH, buyer got slots
        assertEq(maker.balance - sellerBefore, 0.01e18);
        assertEq(slots.balanceOf(taker, clob.currentEpoch()), 10e18);
        assertEq(slots.balanceOf(address(clob), clob.currentEpoch()), 0);
        (,,,,,, Clob.Status status) = clob.orders(1);
        assertEq(uint8(status), uint8(Clob.Status.Filled));
    }

    function test_matchRefundsPriceDifference() public {
        uint256 ep = clob.currentEpoch();
        vm.prank(maker);
        clob.placeOrder(false, ep, 10e18, 0.001e18); // sell @ 0.001
        vm.prank(taker);
        clob.placeOrder{value: 0.02e18}(true, ep, 10e18, 0.002e18); // buy @ 0.002
        uint256 before = taker.balance;
        vm.prank(taker);
        clob.matchOrders(2, 1);
        // buyer refunded the 0.001 excess per unit
        assertEq(taker.balance - before, 0.01e18);
    }

    function test_noCrossReverts() public {
        uint256 ep = clob.currentEpoch();
        vm.prank(maker);
        clob.placeOrder{value: 0.005e18}(true, ep, 10e18, 0.0005e18); // low bid
        vm.prank(maker);
        clob.placeOrder{value: 0.005e18}(false, ep, 10e18, 0.001e18); // high ask
        vm.expectRevert("no cross");
        clob.matchOrders(1, 2);
    }

    function test_expireEpochRefundsAll() public {
        uint256 ep = clob.currentEpoch();
        vm.prank(maker);
        clob.placeOrder{value: 0.01e18}(true, ep, 10e18, 0.001e18);
        uint256 before = maker.balance;
        vm.roll(block.number + EPOCH_LEN);
        uint256 next = clob.currentEpoch();
        vm.expectRevert(Clob.EpochNotExpired.selector);
        clob.expireEpoch(next); // current epoch cannot expire

        clob.expireEpoch(0);
        assertEq(maker.balance - before, 0.01e18);
        (,,,,,, Clob.Status status) = clob.orders(1);
        assertEq(uint8(status), uint8(Clob.Status.Expired));
    }

    function test_epochMismatchReverts() public {
        uint256 next = clob.currentEpoch() + 1;
        vm.expectRevert(Clob.EpochMismatch.selector);
        clob.placeOrder{value: 1 ether}(true, next, 10e18, 0.001e18);
    }

    function test_onlyMakerCanCancel() public {
        uint256 ep = clob.currentEpoch();
        vm.prank(maker);
        uint256 id = clob.placeOrder{value: 0.01e18}(true, ep, 10e18, 0.001e18);
        vm.prank(taker);
        vm.expectRevert(Clob.NotOwner.selector);
        clob.cancelOrder(id);
    }
}
// ---------------------------------------------------------------------
// §2 multi-pool registry — quote + executeRoute
// ---------------------------------------------------------------------

contract RouterRegistryTest is Test {
    uint160 constant HOOK_FLAGS = uint160(1 << 7 | 1 << 3);
    IPoolManager manager;
    MockUSDC usdc;
    CadenceSlots slots;
    CadenceHook hook;
    CadenceRouter router;
    PoolKey key;
    address trader = makeAddr("trader");
    uint256 constant EPOCH_LEN = 12;

    function setUp() public {
        manager = IPoolManager(address(new PoolManager(address(0))));
        usdc = new MockUSDC(address(this));
        bytes memory codeSlots =
            abi.encodePacked(type(CadenceSlots).creationCode, abi.encode(0.001e18, 0.002e18, "", address(this)));
        address slotsAddr = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(41)), keccak256(codeSlots)))
                )
            )
        );
        bytes memory codeRouter = abi.encodePacked(type(CadenceRouter).creationCode, abi.encode(manager, address(usdc)));
        address routerAddr = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(42)), keccak256(codeRouter))
                    )
                )
            )
        );
        bytes memory args =
            abi.encode(manager, address(usdc), slotsAddr, routerAddr, 2000, EPOCH_LEN, 30, 1000, address(this));
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
        slots = new CadenceSlots{salt: bytes32(uint256(41))}(0.001e18, 0.002e18, "", address(this));
        router = new CadenceRouter{salt: bytes32(uint256(42))}(manager, address(usdc));
        hook = new CadenceHook{salt: salt}(
            manager, address(usdc), slotsAddr, routerAddr, 2000, EPOCH_LEN, 30, 1000, address(this)
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
        usdc.approve(address(hook), type(uint256).max);
        hook.seedUsdc(3_000_000e18);
        hook.seedEth{value: 500e18}();
        vm.deal(trader, 10_000e18);
    }

    function test_registerAndQuote() public {
        router.registerPool(key);
        (bytes32[] memory ids, address[] memory hs, uint256[] memory rem, uint256[] memory prices) =
            router.quoteRoute(100e18, true);
        assertEq(ids.length, 1);
        assertEq(hs[0], address(hook));
        assertGt(rem[0], 0); // remaining = budget - sold, nonzero after refresh
        assertEq(prices[0], 0.001e18);
    }

    function test_quoteSkipsPoolsTooSmall() public {
        router.registerPool(key);
        (bytes32[] memory ids,,,) = router.quoteRoute(1_000_000e18, true);
        assertEq(ids.length, 0, "pool cannot serve oversized intent");
    }

    function test_registerPoolRequiresCadenceHook() public {
        PoolKey memory bad = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(usdc)),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(0xdead))
        });
        vm.expectRevert();
        router.registerPool(bad);
    }

    function test_executeRouteMintsSlotAndSwaps() public {
        router.registerPool(key);
        bytes32 poolId = keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks));
        uint256 size = 5e18;
        uint256 cost = (size * 0.001e18) / 1e18;
        uint256 before = trader.balance;
        vm.prank(trader);
        router.executeRoute{value: size + cost + 1 ether}(poolId, size);
        // slot minted and consumed by the fill; leftover ETH refunded
        assertEq(slots.balanceOf(trader, 0), 0, "slot consumed by fill");
        assertApproxEqAbs(trader.balance, before - size - cost, 1e12);
        // active reserves drained by exactly the fill size (λ was 100 = 20% of 500)
        assertEq(hook.activeEth(), 100e18 - size);
    }
}
