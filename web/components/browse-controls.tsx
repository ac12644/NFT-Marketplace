'use client';

import type { Nft } from '@/hooks/use-market';

export type Status = 'all' | 'buy-now' | 'auction' | 'has-offers';
export type Sort = 'recent' | 'price-asc' | 'price-desc';

const STATUSES: [Status, string][] = [
  ['all', 'All'],
  ['buy-now', 'Buy now'],
  ['auction', 'On auction'],
  ['has-offers', 'Has offers'],
];

const SORTS: [Sort, string][] = [
  ['recent', 'Recently added'],
  ['price-asc', 'Price: low to high'],
  ['price-desc', 'Price: high to low'],
];

/** Price a token is currently asking, for sorting. */
function askingPrice(nft: Nft) {
  if (nft.listing) return nft.listing.price;
  if (nft.auction) {
    return nft.auction.highestBid > 0n
      ? nft.auction.highestBid
      : nft.auction.reservePrice;
  }
  return null;
}

export function applyControls(nfts: Nft[], status: Status, sort: Sort) {
  const filtered = nfts.filter((nft) => {
    if (status === 'buy-now') return Boolean(nft.listing);
    if (status === 'auction') return Boolean(nft.auction);
    if (status === 'has-offers') return nft.offers.length > 0;
    return true;
  });

  if (sort === 'recent') {
    return [...filtered].sort((a, b) => (a.tokenId > b.tokenId ? -1 : 1));
  }

  // Tokens with no asking price sort last either way.
  return [...filtered].sort((a, b) => {
    const left = askingPrice(a);
    const right = askingPrice(b);
    if (left === null) return 1;
    if (right === null) return -1;
    if (left === right) return 0;
    return sort === 'price-asc'
      ? left < right
        ? -1
        : 1
      : left > right
        ? -1
        : 1;
  });
}

export function BrowseControls({
  status,
  onStatus,
  sort,
  onSort,
  count,
}: {
  status: Status;
  onStatus: (next: Status) => void;
  sort: Sort;
  onSort: (next: Sort) => void;
  count: number;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-3 border-b pb-4">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter">
        {STATUSES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onStatus(value)}
            aria-pressed={status === value}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              status === value
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <span className="font-mono text-sm text-muted-foreground">
        {count} {count === 1 ? 'item' : 'items'}
      </span>

      <select
        value={sort}
        onChange={(event) => onSort(event.target.value as Sort)}
        aria-label="Sort by"
        className="ml-auto h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SORTS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
