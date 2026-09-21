// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Marketplace} from '../Marketplace.sol';

/// @dev Test double. A plausible v2: appends one new storage variable and one
///      new function, leaving every inherited slot exactly where it was.
///      Used to prove an upgrade preserves live listings and balances.
contract MarketplaceV2 is Marketplace {
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() Marketplace() {}

  // Appended after every v1 variable — never inserted or reordered.
  string public versionTag;

  function setVersionTag(string calldata tag) external {
    versionTag = tag;
  }

  function version() external pure returns (uint256) {
    return 2;
  }
}
