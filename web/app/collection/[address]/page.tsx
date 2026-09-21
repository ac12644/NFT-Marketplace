'use client';

import { use } from 'react';

import { useCollectionDetail, marketStats } from '@/hooks/use-market';
import { NftGrid } from '@/components/nft-grid';
import { AddressLink } from '@/components/address-link';
import { Stat, PriceStat } from '@/components/stat';
import { Skeleton } from '@/components/ui/skeleton';

export default function CollectionPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const {
    data: collection,
    isLoading,
    error,
  } = useCollectionDetail(address as `0x${string}`);

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-48 rounded-none sm:h-64" />
        <div className="mx-auto max-w-6xl px-4">
          <Skeleton className="-mt-12 size-24 rounded-xl" />
          <Skeleton className="mt-4 h-8 w-64" />
        </div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <p className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No collection at this address was created through this marketplace.
        </p>
      </div>
    );
  }

  const { metadata, items } = collection;
  const stats = marketStats(items);

  return (
    <div>
      {/* Banner and avatar come from the collection's ERC-7572 metadata, the
          same JSON external marketplaces read from contractURI(). */}
      <div className="artwork-backdrop h-48 w-full overflow-hidden border-b sm:h-64">
        {metadata.banner_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={metadata.banner_image}
            alt=""
            className="size-full object-cover"
          />
        )}
      </div>

      <div className="mx-auto max-w-6xl px-4">
        <div className="-mt-12 flex items-end gap-4">
          <div className="artwork-backdrop size-24 shrink-0 overflow-hidden rounded-xl border-4 border-background bg-surface">
            {metadata.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={metadata.image}
                alt=""
                className="size-full object-cover"
              />
            )}
          </div>
        </div>

        <header className="mt-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              {collection.name}
            </h1>
            <span className="font-mono text-sm text-muted-foreground">
              {collection.symbol}
            </span>
          </div>

          {metadata.description && (
            <p className="max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground">
              {metadata.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span>
              Created by <AddressLink address={collection.owner} />
            </span>
            <span>
              Contract <AddressLink address={collection.address} />
            </span>
            {metadata.external_link && (
              <a
                href={metadata.external_link}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 transition-colors hover:text-foreground"
              >
                {metadata.external_link.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </header>

        <div className="mt-8 grid grid-cols-2 gap-6 rounded-lg border bg-surface p-5 sm:grid-cols-4">
          <PriceStat label="Floor" amount={stats.floor} />
          <Stat label="Items" value={stats.items} />
          <Stat label="Listed" value={stats.listed} />
          <Stat label="On auction" value={stats.auctions} />
        </div>

        <div className="py-12">
          <NftGrid
            nfts={items}
            isLoading={false}
            empty="Nothing has been minted in this collection yet."
          />
        </div>
      </div>
    </div>
  );
}
