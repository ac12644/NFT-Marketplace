// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC1155} from '@openzeppelin/contracts/token/ERC1155/ERC1155.sol';

/// @dev Test double. Plain ERC-1155 with open minting.
contract MockERC1155 is ERC1155 {
  constructor() ERC1155('ipfs://mock/{id}') {}

  function mint(address to, uint256 id, uint256 amount) external {
    _mint(to, id, amount, '');
  }
}
