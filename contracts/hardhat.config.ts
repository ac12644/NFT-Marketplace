import type { HardhatUserConfig } from 'hardhat/config';
import { configVariable } from 'hardhat/config';
import hardhatToolboxViem from '@nomicfoundation/hardhat-toolbox-viem';
import hardhatVerify from '@nomicfoundation/hardhat-verify';

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem, hardhatVerify],
  paths: {
    sources: './src',
  },
  solidity: {
    version: '0.8.37',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Pinned explicitly rather than inherited: the contract uses transient
      // storage (ReentrancyGuardTransient), which needs cancun or later.
      evmVersion: 'cancun',
      // viaIR stays off. It is not needed for gas here, and every high and
      // medium severity compiler bug on record for this codebase's version
      // range required it. Turning it on is a deliberate decision, not a
      // default.
      viaIR: false,
      // Needed by test/storage-layout.test.ts, which checks that an upgrade
      // cannot reorder or remove a storage variable behind the proxy.
      outputSelection: {
        '*': { '*': ['storageLayout'] },
      },
    },
  },
  // Source verification on the Amoy explorer. Set the key with
  // `npx hardhat keystore set ETHERSCAN_API_KEY` — Etherscan v2 keys cover
  // Polygon, so one key works for Amoy.
  verify: {
    etherscan: {
      apiKey: configVariable('ETHERSCAN_API_KEY'),
    },
  },

  networks: {
    hardhatMainnet: { type: 'edr-simulated', chainType: 'l1' },
    // `npx hardhat node`, for `pnpm seed`.
    localhost: {
      type: 'http',
      chainType: 'l1',
      url: 'http://127.0.0.1:8545',
    },
    amoy: {
      type: 'http',
      chainType: 'l1',
      url: configVariable('AMOY_RPC_URL'),
      accounts: [configVariable('DEPLOYER_PRIVATE_KEY')],
    },
  },
};

export default config;
