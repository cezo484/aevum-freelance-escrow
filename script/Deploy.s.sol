// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/FreelanceEscrow.sol";

/// @notice Minimal cheatcode interface, so the script runs on a plain
/// Foundry install with no extra packages.
interface Vm {
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploy FreelanceEscrow to QDay Aevum.
/// Needs a funded deployer key in the PRIVATE_KEY env var.
/// Run from the repo root:
///   forge script script/Deploy.s.sol --rpc-url https://rpc-test.qday.info --broadcast
contract Deploy {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;

    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(key);
        new FreelanceEscrow(TUSD8);
        vm.stopBroadcast();
    }
}
