// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import {IERC2981} from '@openzeppelin/contracts/interfaces/IERC2981.sol';

/// @dev Test double. An ERC-721 that advertises ERC-2981 and then misbehaves:
///      either reverting, or claiming the entire sale price as royalty.
contract MaliciousRoyalty is ERC721 {
  enum Mode {
    Revert,
    TakeEverything
  }

  Mode public mode;
  address public receiver;

  constructor(Mode initialMode, address royaltyReceiver) ERC721('Bad', 'BAD') {
    mode = initialMode;
    receiver = royaltyReceiver;
  }

  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }

  function royaltyInfo(
    uint256,
    uint256 salePrice
  ) external view returns (address, uint256) {
    if (mode == Mode.Revert) revert('royaltyInfo exploded');
    return (receiver, salePrice); // 100% of the sale
  }

  function supportsInterface(
    bytes4 interfaceId
  ) public view override returns (bool) {
    return
      interfaceId == type(IERC2981).interfaceId ||
      super.supportsInterface(interfaceId);
  }
}
