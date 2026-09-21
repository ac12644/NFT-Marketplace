import assert from 'node:assert/strict';
import { network } from 'hardhat';
import { encodeFunctionData } from 'viem';

export const { viem, networkHelpers } = await network.getOrCreate();

export const ZERO = '0x0000000000000000000000000000000000000000' as const;
export const FEE_BPS = 250n; // 2.5%
export const BPS = 10_000n;

export type Wallet = Awaited<
  ReturnType<typeof viem.getWalletClients>
>[number];

/** Viem surfaces a reverted custom error by name in the thrown message. */
export async function rejectsWith(promise: Promise<unknown>, errorName: string) {
  await assert.rejects(promise, (error: Error) => {
    assert.match(
      error.message,
      new RegExp(errorName),
      `expected revert ${errorName}, got: ${error.message.slice(0, 300)}`,
    );
    return true;
  });
}

export async function future(seconds: number) {
  return BigInt(await networkHelpers.time.latest()) + BigInt(seconds);
}

export async function deployAll() {
  const [admin, seller, buyer, other] = await viem.getWalletClients();

  const factory = await viem.deployContract('CollectionFactory', [
    admin.account.address,
  ]);
  const collection = await createCollection(factory, admin, 'Demo', 'DEMO');

  // The marketplace runs behind an ERC-1967 proxy, so every test in this
  // suite exercises the proxied path rather than a bare implementation.
  const { marketplace, implementation, timelock } = await deployMarketplace(
    admin,
  );

  return {
    admin,
    seller,
    buyer,
    other,
    factory,
    collection,
    marketplace,
    implementation,
    timelock,
  };
}

/** Clone a collection through the factory and return a typed handle to it. */
export async function createCollection(
  factory: Awaited<ReturnType<typeof viem.deployContract<'CollectionFactory'>>>,
  owner: Wallet,
  name: string,
  symbol: string,
  contractURI = '',
) {
  const hash = await factory.write.create([name, symbol, contractURI], {
    account: owner.account,
  });

  const publicClient = await viem.getPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  const [created] = await publicClient.getContractEvents({
    address: factory.address,
    abi: factory.abi,
    eventName: 'CollectionCreated',
    blockHash: receipt.blockHash,
  });

  const address = created.args.collection as `0x${string}`;
  return viem.getContractAt('MarketplaceCollection', address);
}

export type Deployed = Awaited<ReturnType<typeof deployAll>>;

/** Mint to `who` and approve the marketplace to move it. */
export async function mintApproved(
  { collection, marketplace }: Deployed,
  who: Wallet,
  royaltyBps = 0n,
) {
  await collection.write.mint(['ipfs://meta', royaltyBps], {
    account: who.account,
  });
  const tokenId = await collection.read.totalMinted();

  await collection.write.setApprovalForAll([marketplace.address, true], {
    account: who.account,
  });

  return tokenId;
}

/** Split a sale price the way the contract does. */
export function split(price: bigint, royaltyBps = 0n) {
  const fee = (price * FEE_BPS) / BPS;
  const royalty = (price * royaltyBps) / BPS;
  return { fee, royalty, seller: price - fee - royalty };
}

/** Minimum delay on the upgrade timelock, in seconds. */
export const UPGRADE_DELAY = 2n * 24n * 60n * 60n; // 48 hours

/**
 * Deploys implementation -> timelock -> proxy, initialising through the proxy
 * so all state lands in the proxy's storage.
 */
export async function deployMarketplace(admin: Wallet) {
  const implementation = await viem.deployContract('Marketplace');

  /* Deployed the way production should be: admin proposes, anyone executes,
     and nobody holds DEFAULT_ADMIN_ROLE on the timelock except the timelock
     itself — so the delay cannot be shortened or bypassed by a single key. */
  const timelock = await viem.deployContract('MarketplaceTimelock', [
    UPGRADE_DELAY,
    [admin.account.address], // proposers
    [ZERO], // executors: address(0) = anyone
    ZERO, // admin: none
  ]);

  const initData = encodeFunctionData({
    abi: implementation.abi,
    functionName: 'initialize',
    args: [
      admin.account.address,
      admin.account.address,
      FEE_BPS,
      timelock.address,
    ],
  });

  const proxy = await viem.deployContract('MarketplaceProxy', [
    implementation.address,
    initData,
  ]);

  // Same ABI, but every call routed through the proxy.
  const marketplace = await viem.getContractAt('Marketplace', proxy.address);

  return { marketplace, implementation, timelock, proxy };
}
