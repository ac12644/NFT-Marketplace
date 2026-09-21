'use client';

import { useState } from 'react';

import { useForSale } from '@/hooks/use-market';
import { NftGrid } from '@/components/nft-grid';
import {
  BrowseControls,
  applyControls,
  type Sort,
  type Status,
} from '@/components/browse-controls';

export default function BrowsePage() {
  const { data, isLoading, error } = useForSale();
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>('recent');

  const visible = data ? applyControls(data, status, sort) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">Market</h1>

      {!isLoading && data && (
        <BrowseControls
          status={status}
          onStatus={setStatus}
          sort={sort}
          onSort={setSort}
          count={visible?.length ?? 0}
        />
      )}

      <NftGrid
        nfts={visible}
        isLoading={isLoading}
        error={error}
        empty={
          status === 'all'
            ? 'Nothing is for sale yet.'
            : 'Nothing matches that filter.'
        }
      />
    </div>
  );
}
