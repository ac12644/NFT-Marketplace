'use client';

import { formatEther } from 'viem';
import {
  GavelIcon,
  HandCoinsIcon,
  SparklesIcon,
  TagIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';

import type { Activity } from '@/hooks/use-market';
import { chain, explorerTxUrl, NATIVE } from '@/lib/chain';
import { shortAddress } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type Row = {
  icon: LucideIcon;
  action: string;
  actor?: string;
  amount?: bigint;
  token?: string;
  live?: boolean;
};

/** Turns a raw log into something a person can read. */
function describe(entry: Activity): Row | null {
  const a = entry.args;
  const addr = (key: string) => a[key] as string | undefined;
  const wei = (key: string) => a[key] as bigint | undefined;
  const token = (a.payToken as string) ?? NATIVE;

  switch (entry.type) {
    case 'Listed':
      return {
        icon: TagIcon,
        action: 'Listed for sale',
        actor: addr('seller'),
        amount: wei('price'),
        token,
      };
    case 'ListingCancelled':
      return { icon: XIcon, action: 'Listing cancelled', actor: addr('seller') };
    case 'Sold':
      return {
        icon: SparklesIcon,
        action: 'Sold',
        actor: addr('buyer'),
        amount: wei('price'),
        token,
      };
    case 'OfferMade':
      return {
        icon: HandCoinsIcon,
        action: 'Offer made',
        actor: addr('buyer'),
        amount: wei('price'),
        token,
      };
    case 'OfferCancelled':
      return { icon: XIcon, action: 'Offer withdrawn', actor: addr('buyer') };
    case 'OfferAccepted':
      return {
        icon: SparklesIcon,
        action: 'Offer accepted',
        actor: addr('seller'),
        amount: wei('price'),
        token,
      };
    case 'AuctionCreated':
      return {
        icon: GavelIcon,
        action: 'Auction opened',
        actor: addr('seller'),
        amount: wei('reservePrice'),
        token,
      };
    case 'BidPlaced':
      return {
        icon: GavelIcon,
        action: 'Bid placed',
        actor: addr('bidder'),
        amount: wei('amount'),
        token,
        live: true,
      };
    case 'AuctionSettled':
      return {
        icon: SparklesIcon,
        action:
          addr('winner') === '0x0000000000000000000000000000000000000000'
            ? 'Auction closed with no bids'
            : 'Auction won',
        actor: addr('winner'),
        amount: wei('amount'),
        token,
      };
    case 'AuctionCancelled':
      return { icon: XIcon, action: 'Auction cancelled', actor: addr('seller') };
    default:
      return null;
  }
}

export function ActivityFeed({
  entries,
  isLoading,
}: {
  entries?: Activity[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-px">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-none first:rounded-t-md last:rounded-b-md" />
        ))}
      </div>
    );
  }

  const rows = (entries ?? [])
    .map((entry) => ({ entry, row: describe(entry) }))
    .filter((item): item is { entry: Activity; row: Row } => item.row !== null);

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Nothing has happened to this token yet.
      </p>
    );
  }

  return (
    <ol className="overflow-hidden rounded-md border">
      {rows.map(({ entry, row }) => {
        const Icon = row.icon;
        const zero = '0x0000000000000000000000000000000000000000';

        return (
          <li
            key={`${entry.transactionHash}-${entry.logIndex}`}
            className="flex items-center gap-3 border-b bg-surface px-4 py-3 last:border-b-0"
          >
            <Icon
              className={`size-4 shrink-0 ${row.live ? 'text-accent' : 'text-muted-foreground'}`}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.action}</p>
              {row.actor && row.actor !== zero && (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {shortAddress(row.actor, 4)}
                </p>
              )}
            </div>

            {row.amount !== undefined && row.amount > 0n && (
              <span className="shrink-0 font-mono text-sm">
                {formatEther(row.amount)}{' '}
                <span className="text-muted-foreground">
                  {row.token === NATIVE ? chain.nativeCurrency.symbol : ''}
                </span>
              </span>
            )}

            <BlockRef
              hash={entry.transactionHash}
              blockNumber={entry.blockNumber}
            />
          </li>
        );
      })}
    </ol>
  );
}

/** Links to the explorer where there is one; a local node has none. */
function BlockRef({
  hash,
  blockNumber,
}: {
  hash: `0x${string}`;
  blockNumber: bigint;
}) {
  const href = explorerTxUrl(hash);
  const label = `#${blockNumber.toString()}`;
  const className = 'shrink-0 font-mono text-xs text-muted-foreground';

  if (!href) return <span className={className}>{label}</span>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${className} transition-colors hover:text-foreground`}
    >
      {label}
    </a>
  );
}
