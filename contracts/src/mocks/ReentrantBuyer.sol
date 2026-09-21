// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC721Receiver} from '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';

interface IMarketplaceLike {
  function buy(
    uint256 listingId,
    uint256 expectedPrice,
    address expectedPayToken
  ) external payable;

  function withdraw(address token) external;
}

/// @dev Test double. Re-enters the marketplace from `onERC721Received`, which
///      fires mid-`buy` while the marketplace is still on the stack.
contract ReentrantBuyer is IERC721Receiver {
  IMarketplaceLike public immutable marketplace;

  uint256 public targetListingId;
  uint256 public targetPrice;
  bool public armed;
  bool public reentered;
  bytes public lastRevert;

  constructor(address marketplaceAddress) {
    marketplace = IMarketplaceLike(marketplaceAddress);
  }

  receive() external payable {}

  function attack(uint256 listingId, uint256 price) external payable {
    targetListingId = listingId;
    targetPrice = price;
    armed = true;
    marketplace.buy{value: price}(listingId, price, address(0));
    armed = false;
  }

  function onERC721Received(
    address,
    address,
    uint256,
    bytes calldata
  ) external returns (bytes4) {
    if (armed) {
      armed = false; // one shot, so a failed re-entry doesn't loop
      reentered = true;

      // Both of these must fail: the guard is transient-storage based and the
      // listing is already marked inactive before the transfer happens.
      try
        marketplace.buy{value: address(this).balance}(
          targetListingId,
          targetPrice,
          address(0)
        )
      {
        revert('reentrancy succeeded');
      } catch (bytes memory reason) {
        lastRevert = reason;
      }
    }
    return IERC721Receiver.onERC721Received.selector;
  }
}
