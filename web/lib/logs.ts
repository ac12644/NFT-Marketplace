import { parseAbiItem, type Address, type PublicClient } from 'viem';
import { marketplaceAbi, factoryAbi, collectionAbi } from '@/lib/abi';

/* Most hosted RPCs cap `eth_getLogs` at a 10k block span, and Amoy produces
   ~43k blocks a day, so one full-history query starts failing within hours of
   deployment. Chunking keeps it working.
   ponytail: linear scan of history. Move to a Ponder/subgraph indexer if this
   gets busy enough to feel slow. */
const MAX_SPAN = 9_000n;

function spans(fromBlock: bigint, toBlock: bigint) {
  const out: { fromBlock: bigint; toBlock: bigint }[] = [];

  for (let start = fromBlock; start <= toBlock; start += MAX_SPAN + 1n) {
    const end = start + MAX_SPAN > toBlock ? toBlock : start + MAX_SPAN;
    out.push({ fromBlock: start, toBlock: end });
  }

  return out;
}

type MarketEvent = 'Listed' | 'AuctionCreated' | 'OfferMade';

export async function getMarketEvents<TEvent extends MarketEvent>(
  client: PublicClient,
  address: Address,
  eventName: TEvent,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const pages = await Promise.all(
    spans(fromBlock, toBlock).map((span) =>
      client.getContractEvents({
        address,
        abi: marketplaceAbi,
        eventName,
        ...span,
      }),
    ),
  );

  return pages.flat();
}

export async function getCollections(
  client: PublicClient,
  factory: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const pages = await Promise.all(
    spans(fromBlock, toBlock).map((span) =>
      client.getContractEvents({
        address: factory,
        abi: factoryAbi,
        eventName: 'CollectionCreated',
        ...span,
      }),
    ),
  );

  return pages.flat();
}

/** Tokens minted in one collection. */
export async function getMintedEvents(
  client: PublicClient,
  collection: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const pages = await Promise.all(
    spans(fromBlock, toBlock).map((span) =>
      client.getContractEvents({
        address: collection,
        abi: collectionAbi,
        eventName: 'Minted',
        ...span,
      }),
    ),
  );

  return pages.flat();
}

const TRANSFER = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
);

/**
 * Every ERC-721 that has ever landed in `owner`'s hands, across every
 * collection at once.
 *
 * Deliberately not filtered by contract address: one topic-filtered query
 * covers all collections, where a per-collection loop would grow with the
 * number of collections. Results are filtered against the known set by the
 * caller, and current ownership is re-read on chain anyway.
 */
export async function getIncomingTransfers(
  client: PublicClient,
  owner: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const pages = await Promise.all(
    spans(fromBlock, toBlock).map((span) =>
      client.getLogs({
        event: TRANSFER,
        args: { to: owner },
        ...span,
      }),
    ),
  );

  return pages.flat();
}

/** Every order event this marketplace emits, in one list. */
export const ORDER_EVENTS = [
  'Listed',
  'ListingCancelled',
  'Sold',
  'OfferMade',
  'OfferCancelled',
  'OfferAccepted',
  'AuctionCreated',
  'BidPlaced',
  'AuctionSettled',
  'AuctionCancelled',
] as const;

export type OrderEvent = (typeof ORDER_EVENTS)[number];

/**
 * The on-chain history of one token.
 *
 * Every order event is indexed by `(orderId, collection, tokenId)`, so the node
 * filters by topic and returns only this token's events — no fetching the whole
 * history and discarding most of it client-side.
 */
export async function getTokenActivity(
  client: PublicClient,
  marketplace: Address,
  collection: Address,
  tokenId: bigint,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const queries = ORDER_EVENTS.flatMap((eventName) =>
    spans(fromBlock, toBlock).map((span) =>
      client
        .getContractEvents({
          address: marketplace,
          abi: marketplaceAbi,
          eventName,
          args: { collection, tokenId },
          ...span,
        })
        .catch(() => []),
    ),
  );

  return (await Promise.all(queries)).flat();
}
