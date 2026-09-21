'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient, useAccount } from 'wagmi';
import { getAddress, type Address, type PublicClient } from 'viem';

import { marketplaceAbi, collectionAbi } from '@/lib/abi';
import { marketplaceAddress, factoryAddress, deployBlock } from '@/lib/chain';
import {
  fetchMetadata,
  fetchCollectionMetadata,
  type NftMetadata,
  type CollectionMetadata,
} from '@/lib/metadata';
import {
  getCollections,
  getIncomingTransfers,
  getMarketEvents,
  getMintedEvents,
  getTokenActivity,
} from '@/lib/logs';

export type Collection = {
  address: Address;
  owner: Address;
  name: string;
  symbol: string;
};

export type Asset = {
  collection: Address;
  tokenId: bigint;
  amount: bigint;
  standard: number;
};

export type Listing = {
  id: bigint;
  seller: Address;
  payToken: Address;
  price: bigint;
  expiry: bigint;
  asset: Asset;
};

export type Auction = {
  id: bigint;
  seller: Address;
  payToken: Address;
  reservePrice: bigint;
  highestBid: bigint;
  highestBidder: Address;
  endTime: bigint;
  asset: Asset;
};

export type Offer = {
  id: bigint;
  buyer: Address;
  payToken: Address;
  price: bigint;
  expiry: bigint;
  asset: Asset;
};

export type Nft = NftMetadata & {
  collection: Address;
  collectionName?: string;
  tokenId: bigint;
  tokenURI: string;
  owner: Address;
  listing?: Listing;
  auction?: Auction;
  offers: Offer[];
};

const market = { address: marketplaceAddress, abi: marketplaceAbi } as const;

const key = (collection: Address, tokenId: bigint) =>
  `${getAddress(collection)}:${tokenId}`;

/**
 * viem decodes a struct with named components into an *object*, not a
 * positional tuple — so the nested `Asset` arrives with named fields even
 * though its enclosing return value is an array.
 */
function toAsset(raw: unknown): Asset {
  const asset = raw as {
    collection: Address;
    tokenId: bigint;
    amount: bigint;
    standard: number;
  };

  return {
    collection: getAddress(asset.collection),
    tokenId: asset.tokenId,
    amount: asset.amount,
    standard: asset.standard,
  };
}

function idsFrom(logs: { args: Record<string, unknown> }[], field: string) {
  const ids = logs
    .map((log) => log.args[field])
    .filter((id): id is bigint => typeof id === 'bigint');
  return [...new Set(ids)];
}

async function readOrders<T>(
  client: PublicClient,
  ids: bigint[],
  functionName: 'listings' | 'auctions' | 'offers',
  map: (id: bigint, result: readonly unknown[]) => T | null,
) {
  if (ids.length === 0) return [];

  const results = await client.multicall({
    allowFailure: true,
    contracts: ids.map((id) => ({ ...market, functionName, args: [id] })),
  });

  return ids
    .map((id, i) =>
      results[i].status === 'success'
        ? map(id, results[i].result as unknown as readonly unknown[])
        : null,
    )
    .filter((row): row is T => row !== null);
}

/** Collections created through the factory. */
export async function loadCollections(client: PublicClient) {
  const head = await client.getBlockNumber();
  const logs = await getCollections(
    client,
    factoryAddress,
    deployBlock,
    head,
  );

  return logs.map((log): Collection => {
    const args = log.args as {
      collection: Address;
      owner: Address;
      name: string;
      symbol: string;
    };
    return {
      address: getAddress(args.collection),
      owner: getAddress(args.owner),
      name: args.name,
      symbol: args.symbol,
    };
  });
}

export function useCollections() {
  const client = usePublicClient();

  return useQuery({
    queryKey: ['nfts', 'collections'],
    enabled: Boolean(client),
    queryFn: () => loadCollections(client!),
  });
}

/** Collections the connected wallet created. */
export function useMyCollections() {
  const { address } = useAccount();
  const query = useCollections();

  return {
    ...query,
    data: address
      ? query.data?.filter((c) => c.owner === getAddress(address))
      : undefined,
  };
}

/** Live orders, keyed by collection:tokenId. */
async function loadOrders(client: PublicClient) {
  const head = await client.getBlockNumber();
  const now = BigInt(Math.floor(Date.now() / 1000));

  const [listedLogs, auctionLogs, offerLogs] = await Promise.all([
    getMarketEvents(client, marketplaceAddress, 'Listed', deployBlock, head),
    getMarketEvents(
      client,
      marketplaceAddress,
      'AuctionCreated',
      deployBlock,
      head,
    ),
    getMarketEvents(client, marketplaceAddress, 'OfferMade', deployBlock, head),
  ]);

  const [listings, auctions, offers] = await Promise.all([
    readOrders(client, idsFrom(listedLogs as never, 'listingId'), 'listings', (id, r) => {
      const [seller, payToken, price, expiry, active, asset] = r as [
        Address, Address, bigint, bigint, boolean, unknown,
      ];
      if (!active || expiry <= now) return null;
      return { id, seller: getAddress(seller), payToken, price, expiry, asset: toAsset(asset) };
    }),
    readOrders(client, idsFrom(auctionLogs as never, 'auctionId'), 'auctions', (id, r) => {
      const [seller, payToken, reservePrice, highestBid, highestBidder, endTime, settled, asset] =
        r as [Address, Address, bigint, bigint, Address, bigint, boolean, unknown];
      if (settled) return null;
      return {
        id,
        seller: getAddress(seller),
        payToken,
        reservePrice,
        highestBid,
        highestBidder: getAddress(highestBidder),
        endTime,
        asset: toAsset(asset),
      };
    }),
    readOrders(client, idsFrom(offerLogs as never, 'offerId'), 'offers', (id, r) => {
      const [buyer, payToken, price, expiry, active, asset] = r as [
        Address, Address, bigint, bigint, boolean, unknown,
      ];
      if (!active || expiry <= now) return null;
      return { id, buyer: getAddress(buyer), payToken, price, expiry, asset: toAsset(asset) };
    }),
  ]);

  return { listings, auctions, offers };
}

/** Fill in owner, metadata and orders for a set of (collection, tokenId). */
async function hydrate(
  client: PublicClient,
  assets: { collection: Address; tokenId: bigint }[],
  orders: Awaited<ReturnType<typeof loadOrders>>,
  names: Map<string, string>,
): Promise<Nft[]> {
  if (assets.length === 0) return [];

  const state = await client.multicall({
    allowFailure: true,
    contracts: assets.flatMap(({ collection, tokenId }) => [
      { address: collection, abi: collectionAbi, functionName: 'ownerOf', args: [tokenId] },
      { address: collection, abi: collectionAbi, functionName: 'tokenURI', args: [tokenId] },
    ]),
  });

  const rows = assets
    .map(({ collection, tokenId }, i) => {
      const ownerCall = state[i * 2];
      const uriCall = state[i * 2 + 1];
      if (ownerCall.status !== 'success') return null; // burned or not ERC-721

      return {
        collection,
        collectionName: names.get(getAddress(collection)),
        tokenId,
        owner: getAddress(ownerCall.result as unknown as string),
        tokenURI:
          uriCall.status === 'success' ? (uriCall.result as unknown as string) : '',
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return Promise.all(
    rows.map(async (row): Promise<Nft> => {
      const id = key(row.collection, row.tokenId);
      return {
        ...row,
        ...(row.tokenURI ? await fetchMetadata(row.tokenURI) : {}),
        listing: orders.listings.find((l) => key(l.asset.collection, l.asset.tokenId) === id),
        auction: orders.auctions.find((a) => key(a.asset.collection, a.asset.tokenId) === id),
        offers: orders.offers.filter((o) => key(o.asset.collection, o.asset.tokenId) === id),
      };
    }),
  );
}

/**
 * Everything on the market. Derived purely from marketplace events, so it
 * covers every collection without scanning any of them.
 */
export function useForSale() {
  const client = usePublicClient();

  return useQuery({
    queryKey: ['nfts', 'for-sale'],
    enabled: Boolean(client),
    refetchInterval: 20_000, // auctions have a clock
    queryFn: async () => {
      const [orders, collections] = await Promise.all([
        loadOrders(client!),
        loadCollections(client!),
      ]);

      const names = new Map(collections.map((c) => [c.address, c.name]));

      const assets = [
        ...orders.listings.map((l) => l.asset),
        ...orders.auctions.map((a) => a.asset),
      ];
      const unique = [
        ...new Map(assets.map((a) => [key(a.collection, a.tokenId), a])).values(),
      ];

      return hydrate(client!, unique, orders, names);
    },
  });
}

/**
 * Everything the connected wallet owns, across every collection the factory
 * created — including tokens that are not on the market.
 */
export function useMyNfts() {
  const client = usePublicClient();
  const { address } = useAccount();

  return useQuery({
    queryKey: ['nfts', 'mine', address],
    enabled: Boolean(client && address),
    queryFn: async () => {
      const head = await client!.getBlockNumber();

      const [collections, orders, incoming] = await Promise.all([
        loadCollections(client!),
        loadOrders(client!),
        getIncomingTransfers(client!, address!, deployBlock, head),
      ]);

      const known = new Set(collections.map((c) => c.address));
      const names = new Map(collections.map((c) => [c.address, c.name]));

      // Anything that ever arrived, restricted to collections we know about.
      // Current ownership is re-read below, so tokens since sold drop out.
      const candidates = [
        ...new Map(
          incoming
            .filter((log) => known.has(getAddress(log.address)))
            .map((log) => {
              const asset = {
                collection: getAddress(log.address),
                tokenId: log.args.tokenId as bigint,
              };
              return [key(asset.collection, asset.tokenId), asset];
            }),
        ).values(),
      ];

      const nfts = await hydrate(client!, candidates, orders, names);
      return nfts.filter((nft) => nft.owner === getAddress(address!));
    },
  });
}

/* ------------------------------ one token ----------------------------- */

/** A single token with its live market state. */
export function useNft(collection?: Address, tokenId?: bigint) {
  const client = usePublicClient();

  return useQuery({
    queryKey: ['nfts', 'one', collection, tokenId?.toString()],
    enabled: Boolean(client && collection && tokenId !== undefined),
    refetchInterval: 20_000,
    queryFn: async (): Promise<Nft | null> => {
      const [orders, collections] = await Promise.all([
        loadOrders(client!),
        loadCollections(client!),
      ]);
      const names = new Map(collections.map((c) => [c.address, c.name]));

      const [nft] = await hydrate(
        client!,
        [{ collection: getAddress(collection!), tokenId: tokenId! }],
        orders,
        names,
      );

      return nft ?? null;
    },
  });
}

export type Activity = {
  type: string;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
  args: Record<string, unknown>;
};

/** Everything that has happened to one token, newest first. */
export function useActivity(collection?: Address, tokenId?: bigint) {
  const client = usePublicClient();

  return useQuery({
    queryKey: ['nfts', 'activity', collection, tokenId?.toString()],
    enabled: Boolean(client && collection && tokenId !== undefined),
    queryFn: async (): Promise<Activity[]> => {
      const head = await client!.getBlockNumber();

      const logs = await getTokenActivity(
        client!,
        marketplaceAddress,
        getAddress(collection!),
        tokenId!,
        deployBlock,
        head,
      );

      return logs
        .map((log) => ({
          type: (log as { eventName: string }).eventName,
          blockNumber: log.blockNumber ?? 0n,
          transactionHash: log.transactionHash ?? '0x',
          logIndex: log.logIndex ?? 0,
          args: (log.args ?? {}) as Record<string, unknown>,
        }))
        .sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? b.logIndex - a.logIndex
            : a.blockNumber > b.blockNumber
              ? -1
              : 1,
        );
    },
  });
}

/* ----------------------------- collections ---------------------------- */

export type CollectionDetail = Collection & {
  metadata: CollectionMetadata;
  items: Nft[];
};

/** One collection, its ERC-7572 metadata, and everything minted in it. */
export function useCollectionDetail(address?: Address) {
  const client = usePublicClient();

  return useQuery({
    queryKey: ['nfts', 'collection', address],
    enabled: Boolean(client && address),
    queryFn: async (): Promise<CollectionDetail | null> => {
      const target = getAddress(address!);
      const collections = await loadCollections(client!);
      const collection = collections.find((c) => c.address === target);
      if (!collection) return null;

      const [contractURI, mintLogs, orders] = await Promise.all([
        client!.readContract({
          address: target,
          abi: collectionAbi,
          functionName: 'contractURI',
        }),
        getMintedEvents(
          client!,
          target,
          deployBlock,
          await client!.getBlockNumber(),
        ),
        loadOrders(client!),
      ]);

      const tokenIds = [
        ...new Set(
          (mintLogs as { args: { tokenId?: bigint } }[])
            .map((log) => log.args.tokenId)
            .filter((id): id is bigint => id !== undefined),
        ),
      ].sort((a, b) => (a > b ? -1 : 1));

      const names = new Map([[target, collection.name]]);
      const [metadata, items] = await Promise.all([
        fetchCollectionMetadata(contractURI as string),
        hydrate(
          client!,
          tokenIds.map((tokenId) => ({ collection: target, tokenId })),
          orders,
          names,
        ),
      ]);

      return { ...collection, metadata, items };
    },
  });
}

/** Headline numbers for a set of items. */
export function marketStats(items?: Nft[]) {
  if (!items?.length) {
    return { items: 0, listed: 0, auctions: 0, floor: undefined };
  }

  const prices = items
    .filter((nft) => nft.listing)
    .map((nft) => nft.listing!.price);

  return {
    items: items.length,
    listed: prices.length,
    auctions: items.filter((nft) => nft.auction).length,
    floor: prices.length
      ? prices.reduce((low, price) => (price < low ? price : low))
      : undefined,
  };
}
