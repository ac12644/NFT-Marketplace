// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC1967Proxy} from '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol';
import {TimelockController} from '@openzeppelin/contracts/governance/TimelockController.sol';

/// @title MarketplaceProxy
/// @notice The ERC-1967 proxy users actually interact with. All marketplace
///         state lives here; the implementation only supplies logic.
contract MarketplaceProxy is ERC1967Proxy {
  constructor(
    address implementation,
    bytes memory data
  ) ERC1967Proxy(implementation, data) {}
}

/// @notice Holds `UPGRADER_ROLE` on the marketplace, so an upgrade must be
///         scheduled and wait out `minDelay` before it can be executed. That
///         window is what lets users `withdraw` and exit before a change lands.
contract MarketplaceTimelock is TimelockController {
  constructor(
    uint256 minDelay,
    address[] memory proposers,
    address[] memory executors,
    address admin
  ) TimelockController(minDelay, proposers, executors, admin) {}
}
