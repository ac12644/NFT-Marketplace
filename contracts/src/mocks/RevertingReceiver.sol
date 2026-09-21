// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @dev Test double. Refuses native transfers outright. Used to prove an
///      outbid bidder cannot block an auction by being unpayable.
contract RevertingReceiver {
  address public immutable target;

  constructor(address marketplace) {
    target = marketplace;
  }

  receive() external payable {
    revert('I refuse');
  }

  function execute(
    uint256 value,
    bytes calldata data
  ) external payable returns (bytes memory) {
    (bool ok, bytes memory ret) = target.call{value: value}(data);
    require(ok, 'RevertingReceiver: call failed');
    return ret;
  }

  function fund() external payable {}
}
