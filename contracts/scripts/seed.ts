/**
 * Fills a local chain with a marketplace that looks lived-in: three
 * collections, fourteen pieces, live listings and auctions, standing offers,
 * and a couple of completed sales so there is real history to read.
 *
 *   npx hardhat node                       # terminal one
 *   pnpm --filter contracts seed           # terminal two
 *   pnpm dev
 *
 * Everything runs through the real contracts, so this exercises the same code
 * paths production would.
 */
import { network } from 'hardhat';
import { encodeFunctionData, parseEther, getAddress, type Address } from 'viem';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { metadata, COUNT } from './generate-art.mjs';

const BASE_URL = process.env.MOCK_BASE_URL ?? 'http://localhost:3000';
const WEB = resolve(import.meta.dirname, '../../web');

const COLLECTIONS = [
  {
    name: 'Meridian Studies',
    symbol: 'MRDN',
    description:
      'Generative studies in arcs and orbits. Each piece is drawn from a single seed, so the composition is fixed the moment it is minted.',
    tokens: [1, 2, 3, 4, 5],
  },
  {
    name: 'Field Notes',
    symbol: 'FIELD',
    description:
      'Lattices, clusters and drift. An ongoing record of what happens when a regular structure is allowed to misbehave.',
    tokens: [6, 7, 8, 9, 10],
  },
  {
    name: 'Strata',
    symbol: 'STRT',
    description:
      'Sedimentary bands, laid down in sequence. Slower work, fewer pieces.',
    tokens: [11, 12, 13, 14],
  },
];

async function main() {
  const { viem, networkHelpers } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();

  const [deployer, alice, bob, carol] = wallets;
  const collectors = [alice, bob, carol];

  console.log('deployer  ', deployer.account.address);

  /* ----------------------------- contracts ---------------------------- */

  const startBlock = await publicClient.getBlockNumber();

  const factory = await viem.deployContract('CollectionFactory', [
    deployer.account.address,
  ]);

  const timelock = await viem.deployContract('MarketplaceTimelock', [
    2n * 24n * 60n * 60n,
    [deployer.account.address],
    ['0x0000000000000000000000000000000000000000'],
    '0x0000000000000000000000000000000000000000',
  ]);

  const implementation = await viem.deployContract('Marketplace');
  const proxy = await viem.deployContract('MarketplaceProxy', [
    implementation.address,
    encodeFunctionData({
      abi: implementation.abi,
      functionName: 'initialize',
      args: [
        deployer.account.address,
        deployer.account.address,
        250n,
        timelock.address,
      ],
    }),
  ]);

  // A fresh Hardhat node has no Multicall3, and the app batches its reads
  // through one. Public chains already have it at a known address.
  const multicall = await viem.deployContract('Multicall3');

  const market = await viem.getContractAt('Marketplace', proxy.address);
  console.log('factory   ', factory.address);
  console.log('marketplace', proxy.address);

  /* ---------------------------- metadata ------------------------------ */

  mkdirSync(resolve(WEB, 'public/mock'), { recursive: true });

  const created: { address: Address; owner: (typeof wallets)[number] }[] = [];

  for (const [index, spec] of COLLECTIONS.entries()) {
    const owner = collectors[index % collectors.length];

    writeFileSync(
      resolve(WEB, `public/mock/collection-${index + 1}.json`),
      JSON.stringify(
        {
          name: spec.name,
          description: spec.description,
          image: `${BASE_URL}/mock/${spec.tokens[0]}.svg`,
          banner_image: `${BASE_URL}/mock/${spec.tokens[1] ?? spec.tokens[0]}.svg`,
          external_link: 'https://example.com',
        },
        null,
        2,
      ),
    );

    const hash = await factory.write.create(
      [spec.name, spec.symbol, `${BASE_URL}/mock/collection-${index + 1}.json`],
      { account: owner.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const [event] = await publicClient.getContractEvents({
      address: factory.address,
      abi: factory.abi,
      eventName: 'CollectionCreated',
      blockHash: receipt.blockHash,
    });

    created.push({
      address: getAddress(event.args.collection as Address),
      owner,
    });
    console.log(`collection ${spec.symbol.padEnd(6)}`, event.args.collection);
  }

  /* ------------------------------ minting ----------------------------- */

  const minted: {
    collection: Address;
    tokenId: bigint;
    owner: (typeof wallets)[number];
    seed: number;
  }[] = [];

  for (const [index, spec] of COLLECTIONS.entries()) {
    const { address, owner } = created[index];
    const collection = await viem.getContractAt(
      'MarketplaceCollection',
      address,
    );

    // One approval covers everything this wallet lists from the collection.
    await collection.write.setApprovalForAll([proxy.address, true], {
      account: owner.account,
    });

    for (const seed of spec.tokens) {
      writeFileSync(
        resolve(WEB, `public/mock/${seed}.json`),
        JSON.stringify(metadata(seed, BASE_URL), null, 2),
      );

      // A 5% creator royalty, so secondary sales show a royalty split.
      await collection.write.mint([`${BASE_URL}/mock/${seed}.json`, 500n], {
        account: owner.account,
      });

      minted.push({
        collection: address,
        tokenId: await collection.read.totalMinted(),
        owner,
        seed,
      });
    }
  }

  console.log(`minted     ${minted.length} tokens`);

  /* --------------------------- market state --------------------------- */

  const month = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 3600);
  const NATIVE = '0x0000000000000000000000000000000000000000' as const;
  const other = (owner: (typeof wallets)[number]) =>
    collectors.find((c) => c.account.address !== owner.account.address)!;

  const listed: typeof minted = [];

  // Fixed-price listings across a spread of prices.
  const prices = ['0.08', '0.15', '0.42', '1.2', '2.5', '0.65', '3.4'];
  for (const [i, price] of prices.entries()) {
    const token = minted[i];
    await market.write.list(
      [
        token.collection,
        token.tokenId,
        1n,
        NATIVE,
        parseEther(price),
        month,
      ],
      { account: token.owner.account },
    );
    listed.push(token);
  }
  console.log(`listed     ${prices.length}`);

  // Two auctions: one already contested, one still at reserve.
  const contested = minted[8];
  await market.write.createAuction(
    [
      contested.collection,
      contested.tokenId,
      1n,
      NATIVE,
      parseEther('0.5'),
      BigInt(Math.floor(Date.now() / 1000) + 6 * 3600),
    ],
    { account: contested.owner.account },
  );
  const contestedId = (await market.read.nextAuctionId()) - 1n;

  const bidder = other(contested.owner);
  await market.write.bid([contestedId, parseEther('0.5')], {
    account: bidder.account,
    value: parseEther('0.5'),
  });
  await market.write.bid([contestedId, parseEther('0.9')], {
    account: collectors.find(
      (c) =>
        c.account.address !== contested.owner.account.address &&
        c.account.address !== bidder.account.address,
    )!.account,
    value: parseEther('0.9'),
  });

  const quiet = minted[9];
  await market.write.createAuction(
    [
      quiet.collection,
      quiet.tokenId,
      1n,
      NATIVE,
      parseEther('1.75'),
      BigInt(Math.floor(Date.now() / 1000) + 22 * 3600),
    ],
    { account: quiet.owner.account },
  );
  console.log('auctions   2 (one with bids)');

  // Standing offers, including one on a token that is not for sale.
  const offers: [number, string][] = [
    [2, '0.3'],
    [5, '0.5'],
    [11, '0.22'],
    [12, '0.9'],
  ];
  for (const [index, price] of offers) {
    const token = minted[index];
    await market.write.makeOffer(
      [
        token.collection,
        token.tokenId,
        1n,
        NATIVE,
        parseEther(price),
        month,
      ],
      {
        account: other(token.owner).account,
        value: parseEther(price),
      },
    );
  }
  console.log(`offers     ${offers.length}`);

  // Two completed sales, so tokens have provenance and sellers have a balance
  // waiting to be withdrawn.
  for (const index of [0, 3]) {
    const token = listed[index];
    const listingId = await findListing(market, token.collection, token.tokenId);
    if (listingId === null) continue;

    const [, payToken, price] = await market.read.listings([listingId]);
    await market.write.buy([listingId, price, payToken], {
      account: other(token.owner).account,
      value: price,
    });
  }
  console.log('sales      2');

  // One cancelled listing, so the activity feed is not uniformly positive.
  const cancelled = listed[6];
  const cancelledId = await findListing(
    market,
    cancelled.collection,
    cancelled.tokenId,
  );
  if (cancelledId !== null) {
    await market.write.cancelListing([cancelledId], {
      account: cancelled.owner.account,
    });
  }

  // Nudge the clock so the auction countdowns read as genuinely in-flight.
  await networkHelpers.time.increase(60);

  /* ------------------------------- wiring ----------------------------- */

  writeFileSync(
    resolve(WEB, '.env.local'),
    [
      '# Written by `pnpm seed`. Points the app at the local Hardhat node.',
      'NEXT_PUBLIC_CHAIN=local',
      'NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545',
      `NEXT_PUBLIC_MARKETPLACE_ADDRESS=${proxy.address}`,
      `NEXT_PUBLIC_FACTORY_ADDRESS=${factory.address}`,
      `NEXT_PUBLIC_DEPLOY_BLOCK=${startBlock}`,
      `NEXT_PUBLIC_MULTICALL3_ADDRESS=${multicall.address}`,
      '',
    ].join('\n'),
  );

  console.log('\nwrote web/.env.local — run `pnpm dev` and open the market.');
  console.log(
    'To transact, add the Hardhat network (chain 31337, http://127.0.0.1:8545)',
  );
  console.log('to your wallet and import one of the printed test accounts.\n');

  for (const wallet of [alice, bob, carol]) {
    console.log('  collector', wallet.account.address);
  }
}

/** The active listing for a token, found from the Listed events. */
async function findListing(
  market: { address: Address; abi: readonly unknown[]; read: never },
  collection: Address,
  tokenId: bigint,
): Promise<bigint | null> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();

  const logs = await publicClient.getContractEvents({
    address: market.address,
    abi: market.abi as never,
    eventName: 'Listed',
    args: { collection, tokenId },
    fromBlock: 0n,
  });

  const last = logs.at(-1) as { args?: { listingId?: bigint } } | undefined;
  return last?.args?.listingId ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
