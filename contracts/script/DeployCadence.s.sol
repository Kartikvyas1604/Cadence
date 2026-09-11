// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
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
import {Clob} from "../src/Clob.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Clob} from "../src/Clob.sol";

/**
 * @title Deploy Cadence
 * @notice Deploys the full Cadence venue: slots, router, hook (salt-mined
 *         for the beforeSwap flags), initializes the ETH/USDC pool and seeds
 *         the PA-AMM reserves.
 *
 * Env:
 *   PRIVATE_KEY      deployer (funded)          [required]
 *   POOLMANAGER      existing v4 PoolManager    [optional — deploys one if empty]
 *   USDC             existing quote token       [optional — deploys MockUSDC if empty]
 *   LAMBDA_BPS       active fraction, bps       [default 2500]
 *   EPOCH_LENGTH     epoch length in blocks     [default 12]
 *   SLOT_PRICE_ETH   ETH per ETH of capacity    [default 0.001e18]
 *   SEED_ETH / SEED_USDC                     [defaults 1000e18 / 3_000_000e18]
 *
 * Output: deployments/<chainId>.json with all addresses.
 */
contract DeployCadence is Script {
    // hook permissions: BEFORE_SWAP_FLAG (1<<7) | BEFORE_SWAP_RETURNS_DELTA_FLAG (1<<3)
    uint160 constant HOOK_FLAGS = uint160(1 << 7 | 1 << 3);

    uint256 constant LAMBDA_DEFAULT = 2500;
    uint256 constant EPOCH_DEFAULT = 12;
    uint256 constant PRICE_DEFAULT = 0.001e18;

    struct DeployParams {
        uint256 lambda;
        uint256 epochLen;
        uint256 pricePerEth;
        uint256 seedEthAmt;
        uint256 seedUsdcAmt;
        uint256 swapFeeBps;
        uint256 protocolTakeBps;
        address protocolTreasury;
    }

    struct WireCtx {
        IPoolManager manager;
        address usdc;
        address router;
        address slots;
        address hook;
        address clob;
        address deployer;
        DeployParams p;
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        IPoolManager manager = IPoolManager(address(uint160(vm.envOr("POOLMANAGER", uint256(0)))));
        address usdcAddr = address(uint160(vm.envOr("USDC", uint256(0))));
        DeployParams memory p = DeployParams({
            lambda: uint256(vm.envOr("LAMBDA_BPS", uint256(LAMBDA_DEFAULT))),
            epochLen: uint256(vm.envOr("EPOCH_LENGTH", uint256(EPOCH_DEFAULT))),
            pricePerEth: uint256(vm.envOr("SLOT_PRICE_ETH", uint256(PRICE_DEFAULT))),
            seedEthAmt: uint256(vm.envOr("SEED_ETH", uint256(1000e18))),
            seedUsdcAmt: uint256(vm.envOr("SEED_USDC", uint256(3_000_000e18))),
            swapFeeBps: uint256(vm.envOr("SWAP_FEE_BPS", uint256(30))),
            protocolTakeBps: uint256(vm.envOr("PROTOCOL_TAKE_BPS", uint256(1000))),
            protocolTreasury: deployer
        });

        vm.startBroadcast(pk);
        manager = _deployCore(manager, usdcAddr, deployer);
        usdcAddr = _usdcOr(manager, usdcAddr, deployer);
        (bytes32 saltHook, WireCtx memory ctx) = _deployPeripheral(manager, usdcAddr, deployer, p);
        _finishWire(ctx, saltHook);
        vm.stopBroadcast();
    }

    function _deployCore(IPoolManager manager, address, address deployer) internal returns (IPoolManager) {
        if (address(manager) == address(0)) {
            manager = IPoolManager(address(new PoolManager(deployer)));
            console2.log("deployed PoolManager", address(manager));
        }
        return manager;
    }

    function _usdcOr(IPoolManager, address usdcAddr, address deployer) internal returns (address) {
        if (usdcAddr == address(0)) {
            usdcAddr = address(new MockUSDC(deployer));
            console2.log("deployed MockUSDC", usdcAddr);
        }
        return usdcAddr;
    }

    /// @notice Deploy router + slots at known CREATE2 addresses, then mine
    ///         the hook salt for the beforeSwap permission flags.
    function _deployPeripheral(IPoolManager manager, address usdcAddr, address deployerOwner, DeployParams memory p)
        internal
        returns (bytes32 saltHook, WireCtx memory ctx)
    {
        (address routerAddr, address slotsAddr) = _deploySlotsRouter(manager, usdcAddr, deployerOwner, p);
        saltHook = _mineHook(manager, usdcAddr, slotsAddr, routerAddr, p);
        address hookAddr = predict(CREATE2_FACTORY, saltHook, _hookCode(manager, usdcAddr, slotsAddr, routerAddr, p));
        ctx = WireCtx(manager, usdcAddr, routerAddr, slotsAddr, hookAddr, address(0), deployerOwner, p);
    }

    function _deploySlotsRouter(IPoolManager manager, address usdcAddr, address deployerOwner, DeployParams memory p)
        internal
        returns (address routerAddr, address slotsAddr)
    {
        bytes memory codeRouter = abi.encodePacked(type(CadenceRouter).creationCode, abi.encode(manager, usdcAddr));
        bytes32 saltRouter = keccak256(bytes(vm.envOr("SALT_VERSION", string("v4"))));
        routerAddr = predict(CREATE2_FACTORY, saltRouter, codeRouter);
        new CadenceRouter{salt: saltRouter}(manager, usdcAddr);
        console2.log("deployed router", routerAddr);

        bytes memory codeSlots = abi.encodePacked(
            type(CadenceSlots).creationCode, abi.encode(p.pricePerEth, p.pricePerEth * 2, "", deployerOwner)
        );
        // slots salt is version-bumped per redeploy: the immutable CREATE2
        // address of the previous live deployment can never be reused
        bytes32 saltSlots = keccak256(bytes(vm.envOr("SALT_VERSION", string("v4"))));
        slotsAddr = predict(CREATE2_FACTORY, saltSlots, codeSlots);
        new CadenceSlots{salt: saltSlots}(p.pricePerEth, p.pricePerEth * 2, "", deployerOwner);
        console2.log("deployed slots", slotsAddr);
    }

    function _hookCode(
        IPoolManager manager,
        address usdcAddr,
        address slotsAddr,
        address routerAddr,
        DeployParams memory p
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            type(CadenceHook).creationCode,
            abi.encode(
                manager,
                usdcAddr,
                slotsAddr,
                routerAddr,
                p.lambda,
                p.epochLen,
                p.swapFeeBps,
                p.protocolTakeBps,
                p.protocolTreasury
            )
        );
    }

    function _mineHook(
        IPoolManager manager,
        address usdcAddr,
        address slotsAddr,
        address routerAddr,
        DeployParams memory p
    ) internal view returns (bytes32 saltHook) {
        bytes memory code = _hookCode(manager, usdcAddr, slotsAddr, routerAddr, p);
        for (uint256 i = 0;; i++) {
            saltHook = keccak256(abi.encode("cadence.hook.v4", i));
            if (uint160(predict(CREATE2_FACTORY, saltHook, code)) & Hooks.ALL_HOOK_MASK == HOOK_FLAGS) break;
            require(i < 5_000_000, "salt mining failed");
        }
    }

    function _finishWire(WireCtx memory ctx, bytes32 saltHook) internal {
        CadenceHook hook = new CadenceHook{salt: saltHook}(
            ctx.manager,
            ctx.usdc,
            ctx.slots,
            ctx.router,
            ctx.p.lambda,
            ctx.p.epochLen,
            ctx.p.swapFeeBps,
            ctx.p.protocolTakeBps,
            ctx.p.protocolTreasury
        );
        require(address(hook) == ctx.hook, "hook addr drift");
        console2.log("deployed hook", address(hook));

        CadenceSlots(ctx.slots).setHook(address(hook));

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(ctx.usdc),
            fee: 0,
            tickSpacing: 60,
            hooks: hook
        });

        // §1 secondary CLOB + §2 register the default pool
        Clob clob = new Clob(address(hook), IERC1155(ctx.slots));
        ctx.clob = address(clob);
        console2.log("deployed clob", address(clob));
        CadenceRouter(ctx.router).registerPool(key);
        ctx.manager.initialize(key, TickMath.getSqrtPriceAtTick(0));

        // bootstrap: quote-token seed (protocol-owned) + the deployer as the
        // first LP via depositEth (shares + slot-revenue rights)
        uint256 deployerUsdc = MockUSDC(ctx.usdc).balanceOf(ctx.deployer);
        require(deployerUsdc >= ctx.p.seedUsdcAmt, "deployer needs USDC");
        MockUSDC(ctx.usdc).approve(address(hook), ctx.p.seedUsdcAmt);
        hook.seedUsdc(ctx.p.seedUsdcAmt);
        hook.depositEth{value: ctx.p.seedEthAmt}();

        _writeDeployment(ctx, address(hook));
    }

    function _writeDeployment(WireCtx memory ctx, address hook) internal {
        string memory chainId = vm.toString(block.chainid);
        string memory json = "cadence";
        vm.serializeAddress(json, "poolManager", address(ctx.manager));
        vm.serializeAddress(json, "usdc", ctx.usdc);
        vm.serializeAddress(json, "slots", ctx.slots);
        vm.serializeAddress(json, "hook", hook);
        vm.serializeAddress(json, "router", ctx.router);
        vm.serializeAddress(json, "clob", ctx.clob);
        vm.serializeUint(json, "lambdaBps", ctx.p.lambda);
        vm.serializeUint(json, "epochLengthBlocks", ctx.p.epochLen);
        vm.serializeUint(json, "pricePerEth", ctx.p.pricePerEth);
        vm.serializeUint(json, "swapFeeBps", ctx.p.swapFeeBps);
        vm.serializeUint(json, "protocolTakeBps", ctx.p.protocolTakeBps);
        vm.serializeUint(json, "protocolTakeBps", ctx.p.protocolTakeBps);
        string memory out = vm.serializeUint(json, "seedBlock", block.number);
        vm.writeJson(out, string.concat("deployments/", chainId, ".json"));
        console2.log("wrote deployments", string.concat("deployments/", chainId, ".json"));
    }

    function predict(address deployer, bytes32 salt, bytes memory code) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, keccak256(code))))));
    }
}
