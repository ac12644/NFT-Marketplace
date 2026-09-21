// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/// @dev Test double. Plain, well-behaved ERC-20.
contract MockERC20 is ERC20 {
  constructor() ERC20('Mock', 'MOCK') {}

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
