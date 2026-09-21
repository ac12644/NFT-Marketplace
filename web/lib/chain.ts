import { polygonAmoy, hardhat } from 'wagmi/chains';

/** `pnpm seed` sets this, pointing the app at a local Hardhat node. */
const isLocal = process.env.NEXT_PUBLIC_CHAIN === 'local';

/* A fresh Hardhat node has no Multicall3, and the app batches its contract
   reads through one. `pnpm seed` deploys it and passes the address here; on
   Amoy viem's own preset already points at the canonical deployment. */
const localMulticall = process.env.NEXT_PUBLIC_MULTICALL3_ADDRESS as
  | `0x${string}`
  | undefined;

const local = localMulticall
  ? {
      ...hardhat,
      contracts: {
        ...hardhat.contracts,
        multicall3: { address: localMulticall },
      },
    }
  : hardhat;

export const chain = isLocal ? local : polygonAmoy;

function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `${name} is not set. Deploy the contracts (pnpm deploy:amoy), or run ` +
        '`pnpm seed` against a local node, then check web/.env.local.',
    );
  }
  return value as `0x${string}`;
}

export const marketplaceAddress = required(
  'NEXT_PUBLIC_MARKETPLACE_ADDRESS',
  process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS,
);

/// Collections are created by users through this factory, so there is no
/// single collection address to configure.
export const factoryAddress = required(
  'NEXT_PUBLIC_FACTORY_ADDRESS',
  process.env.NEXT_PUBLIC_FACTORY_ADDRESS,
);

export const NATIVE = '0x0000000000000000000000000000000000000000' as const;

/** A local node has no explorer, so links fall back to nothing rather than 404. */
const explorer = chain.blockExplorers?.default.url;

export const explorerTxUrl = (hash: string) =>
  explorer ? `${explorer}/tx/${hash}` : undefined;

export const explorerAddressUrl = (address: string) =>
  explorer ? `${explorer}/address/${address}` : undefined;

/** Block the contracts were deployed in — the floor for event queries. */
export const deployBlock = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? '0');
