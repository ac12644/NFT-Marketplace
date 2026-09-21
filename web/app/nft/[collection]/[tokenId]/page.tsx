'use client';

import { use } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ChevronLeftIcon } from 'lucide-react';

import { useNft, useActivity } from '@/hooks/use-market';
import { shortAddress } from '@/lib/utils';
import { Artwork } from '@/components/artwork';
import { AddressLink } from '@/components/address-link';
import { TradePanel } from '@/components/trade-panel';
import { Traits } from '@/components/traits';
import { ActivityFeed } from '@/components/activity-feed';
import { Skeleton } from '@/components/ui/skeleton';

export default function NftPage({
  params,
}: {
  params: Promise<{ collection: string; tokenId: string }>;
}) {
  const { collection, tokenId } = use(params);
  const address = collection as `0x${string}`;
  const id = BigInt(tokenId);

  const { address: me } = useAccount();
  const { data: nft, isLoading, error } = useNft(address, id);
  const { data: activity, isLoading: loadingActivity } = useActivity(
    address,
    id,
  );

  if (error) {
    return (
      <Shell>
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
          Could not load this token: {error.message}
        </p>
      </Shell>
    );
  }

  if (isLoading || !nft) {
    return (
      <Shell>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Skeleton className="aspect-square rounded-lg" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      </Shell>
    );
  }

  const isOwner = me ? nft.owner === me : false;

  return (
    <Shell>
      <Link
        href={`/collection/${nft.collection}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        {nft.collectionName ?? shortAddress(nft.collection)}
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Artwork
            src={nft.image}
            alt={nft.name ?? `Token ${nft.tokenId}`}
            backgroundColor={nft.background_color}
            className="aspect-square rounded-lg border"
            priority
          />
        </div>

        <div className="flex flex-col gap-8">
          <header className="flex flex-col gap-3">
            <h1 className="text-balance text-3xl font-semibold tracking-tight">
              {nft.name ?? `Token #${nft.tokenId}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              Owned by{' '}
              {isOwner ? (
                <span className="font-medium text-foreground">you</span>
              ) : (
                <AddressLink address={nft.owner} />
              )}
            </p>
          </header>

          <TradePanel nft={nft} />

          {nft.description && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Description</h2>
              <p className="max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground">
                {nft.description}
              </p>
            </section>
          )}

          {nft.attributes && nft.attributes.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">Traits</h2>
              <Traits attributes={nft.attributes} />
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Details</h2>
            <dl className="overflow-hidden rounded-md border text-sm">
              <Detail label="Contract">
                <AddressLink address={nft.collection} />
              </Detail>
              <Detail label="Token ID">
                <span className="font-mono">{nft.tokenId.toString()}</span>
              </Detail>
              <Detail label="Standard">
                <span className="font-mono">ERC-721</span>
              </Detail>
              {nft.external_url && (
                <Detail label="Link">
                  <a
                    href={nft.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-mono text-sm underline underline-offset-4"
                  >
                    {nft.external_url.replace(/^https?:\/\//, '')}
                  </a>
                </Detail>
              )}
            </dl>
          </section>
        </div>
      </div>

      <section className="mt-16 flex flex-col gap-3">
        <h2 className="text-sm font-medium">Activity</h2>
        <ActivityFeed entries={activity} isLoading={loadingActivity} />
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-12">{children}</div>;
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b bg-surface px-4 py-2.5 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}
