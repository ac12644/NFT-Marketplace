// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC165} from '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import {IERC721} from '@openzeppelin/contracts/token/ERC721/IERC721.sol';

/// @dev Test double. Advertises ERC-721 and exposes `initialized()`, so the
///      factory's implementation checks can be exercised independently of a
///      real collection.
contract FakeCollection is ERC165 {
  bool private _locked;

  constructor(bool locked) {
    _locked = locked;
  }

  function initialized() external view returns (bool) {
    return _locked;
  }

  function supportsInterface(
    bytes4 interfaceId
  ) public view override returns (bool) {
    return
      interfaceId == type(IERC721).interfaceId ||
      super.supportsInterface(interfaceId);
  }
}
