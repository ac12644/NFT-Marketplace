'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePublicClient, useWriteContract } from 'wagmi';
import { BaseError, type Address } from 'viem';
import { toast } from 'sonner';

import { marketplaceAbi, collectionAbi, factoryAbi } from '@/lib/abi';
import { marketplaceAddress, factoryAddress, explorerTxUrl } from '@/lib/chain';

/** Wallet rejections and reverts arrive as long nested errors; show the gist. */
function readableError(error: unknown) {
  if (error instanceof BaseError) return error.shortMessage || error.message;
  return error instanceof Error ? error.message : 'Transaction failed';
}

/** 'marketplace' | 'factory' | a collection address. */
type Target = 'marketplace' | 'factory' | Address;

function resolve(target: Target) {
  if (target === 'marketplace') {
    return { address: marketplaceAddress, abi: marketplaceAbi };
  }
  if (target === 'factory') {
    return { address: factoryAddress, abi: factoryAbi };
  }
  return { address: target, abi: collectionAbi };
}

type Send = {
  on?: Target;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  pendingMessage: string;
  successMessage: string;
};

export function useContractWrite() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const send = useCallback(
    async ({
      on = 'marketplace',
      functionName,
      args = [],
      value,
      pendingMessage,
      successMessage,
    }: Send) => {
      let toastId: string | number | undefined;

      try {
        const hash = await writeContractAsync({
          ...resolve(on),
          functionName,
          args,
          value,
        } as never);

        toastId = toast.loading(pendingMessage);

        const receipt = await publicClient!.waitForTransactionReceipt({ hash });

        if (receipt.status === 'reverted') {
          toast.error('Transaction reverted', { id: toastId });
          return null;
        }

        // No explorer on a local node, so the action is dropped rather than
        // offering a link that goes nowhere.
        const explorer = explorerTxUrl(hash);
        toast.success(successMessage, {
          id: toastId,
          ...(explorer && {
            action: {
              label: 'View',
              onClick: () => window.open(explorer, '_blank'),
            },
          }),
        });

        await queryClient.invalidateQueries({ queryKey: ['nfts'] });
        await queryClient.invalidateQueries({ queryKey: ['approval'] });
        return receipt;
      } catch (error) {
        toast.error(readableError(error), { id: toastId });
        return null;
      }
    },
    [writeContractAsync, publicClient, queryClient],
  );

  return { send, isPending };
}

/**
 * Listings are approval-based, so the marketplace needs operator rights on the
 * collection before its tokens can be listed. One approval covers that whole
 * collection, forever.
 */
export function useCollectionApproval(collection: Address) {
  const { send, isPending } = useContractWrite();

  const approve = useCallback(
    () =>
      send({
        on: collection,
        functionName: 'setApprovalForAll',
        args: [marketplaceAddress, true],
        pendingMessage: 'Approving the marketplace…',
        successMessage: 'Approved — you can list now',
      }),
    [send, collection],
  );

  return { approve, isPending };
}
