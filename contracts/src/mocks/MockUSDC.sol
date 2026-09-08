// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice 18-decimal demo quote token for the Cadence pair. Test-only.
contract MockUSDC is ERC20 {
    constructor(address to) ERC20("Cadence USDC", "cUSDC") {
        _mint(to, 1_000_000_000e18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
