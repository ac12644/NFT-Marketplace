'use client';

import { useAccount, useReadContract } from 'wagmi';
import type { Address } from 'viem';

import { collectionAbi } from '@/lib/abi';
import { marketplaceAddress } from '@/lib/chain';

/** Whether the marketplace may move this wallet's tokens in `collection`. */
export function useIsApproved(collection: Address) {
  const { address } = useAccount();

  const { data, isLoading } = useReadContract({
    address: collection,
    abi: collectionAbi,
    functionName: 'isApprovedForAll',
    args: address ? [address, marketplaceAddress] : undefined,
    query: { enabled: Boolean(address) },
  });

  return { isApproved: data === true, isLoading };
}
