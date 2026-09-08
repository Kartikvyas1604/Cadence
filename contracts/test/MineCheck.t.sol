// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {Test} from "forge-std/Test.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

contract Empty {
    uint256 public x;
}

contract MineCheck is Test {
    function test_mine() public {
        bytes memory code = type(Empty).creationCode;
        bytes32 salt = bytes32(uint256(1));
        address predicted = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(code))))));
        Empty e = new Empty{salt: salt}();
        emit log_named_address("predicted", predicted);
        emit log_named_address("actual", address(e));
        emit log_named_address("this", address(this));
    }
}
