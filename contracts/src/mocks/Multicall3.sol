// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @dev Local-chain only. Public networks have Multicall3 deployed at a known
///      address and viem's chain presets point at it; a fresh Hardhat node has
///      nothing there, so `pnpm seed` deploys this and writes its address into
///      web/.env.local.
///
///      Only `aggregate3` is implemented, which is what viem's `multicall`
///      calls.
contract Multicall3 {
  struct Call3 {
    address target;
    bool allowFailure;
    bytes callData;
  }

  struct Result {
    bool success;
    bytes returnData;
  }

  function aggregate3(
    Call3[] calldata calls
  ) external payable returns (Result[] memory returnData) {
    uint256 length = calls.length;
    returnData = new Result[](length);

    for (uint256 i = 0; i < length; i++) {
      Result memory result = returnData[i];
      Call3 calldata call = calls[i];

      (result.success, result.returnData) = call.target.call(call.callData);
      require(call.allowFailure || result.success, 'Multicall3: call failed');
    }
  }
}
