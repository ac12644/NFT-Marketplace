'use client';

import type { Nft } from '@/hooks/use-market';
import { NftCard } from '@/components/nft-card';
import { Skeleton } from '@/components/ui/skeleton';

export function NftGrid({
  nfts,
  isLoading,
  error,
  empty,
}: {
  nfts?: Nft[];
  isLoading: boolean;
  error?: Error | null;
  empty: string;
}) {
  if (error) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Could not reach the contract: {error.message}
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border">
            <Skeleton className="aspect-square rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="mt-2 h-5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!nfts?.length) {
    return (
      <p className="rounded-lg border border-dashed px-6 py-16 text-center text-muted-foreground">
        {empty}
      </p>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {nfts.map((nft) => (
        <NftCard key={`${nft.collection}-${nft.tokenId}`} nft={nft} />
      ))}
    </div>
  );
}
