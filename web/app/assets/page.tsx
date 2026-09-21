'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';

import { useMyNfts, useMyCollections, marketStats } from '@/hooks/use-market';
import { NftGrid } from '@/components/nft-grid';
import { WithdrawCard } from '@/components/withdraw-card';
import { CreateCollection } from '@/components/create-collection';
import { Stat, PriceStat } from '@/components/stat';
import { Button } from '@/components/ui/button';

export default function AssetsPage() {
  const { isConnected } = useAccount();
  const { data: nfts, isLoading, error } = useMyNfts();
  const { data: collections } = useMyCollections();
  const stats = marketStats(nfts);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">My NFTs</h1>

      {!isConnected ? (
        <p className="rounded-lg border border-dashed px-6 py-16 text-center text-muted-foreground">
          Connect a wallet to see what you own.
        </p>
      ) : (
        <>
          <WithdrawCard />

          {nfts && nfts.length > 0 && (
            <div className="mb-10 grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-4">
              <Stat label="Owned" value={stats.items} />
              <Stat label="Listed" value={stats.listed} />
              <Stat label="On auction" value={stats.auctions} />
              <PriceStat label="Your floor" amount={stats.floor} />
            </div>
          )}

          <section className="mb-12">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">
                Your collections
              </h2>
              <CreateCollection />
            </div>

            {collections && collections.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((collection) => (
                  <li key={collection.address}>
                    <Link
                      href={`/collection/${collection.address}`}
                      className="flex items-baseline justify-between gap-3 rounded-lg border bg-surface px-4 py-3 transition-colors hover:border-foreground/25"
                    >
                      <span className="truncate font-medium">
                        {collection.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {collection.symbol}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed p-8">
                <p className="max-w-prose text-sm text-muted-foreground">
                  A collection is your own ERC-721 contract, deployed as a
                  minimal proxy so it costs a fraction of a full deployment.
                  You own it outright and mint into it.
                </p>
                <CreateCollection variant="accent" label="Create a collection" />
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-xl font-semibold tracking-tight">
              Tokens
            </h2>
            <NftGrid
              nfts={nfts}
              isLoading={isLoading}
              error={error}
              empty="You do not own any NFTs yet."
            />
            {!isLoading && nfts?.length === 0 && (
              <div className="mt-4">
                <Button variant="outline" asChild>
                  <Link href="/create">Mint your first</Link>
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
