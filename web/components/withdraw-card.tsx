'use client';

import { useAccount, useReadContract } from 'wagmi';
import { BanknoteIcon } from 'lucide-react';

import { marketplaceAbi } from '@/lib/abi';
import { marketplaceAddress, NATIVE } from '@/lib/chain';
import { useContractWrite } from '@/hooks/use-contract-write';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/price';

/** Proceeds, royalties and outbid refunds are credited, not pushed. Claim here. */
export function WithdrawCard() {
  const { address } = useAccount();
  const { send, isPending } = useContractWrite();

  const { data: owed, refetch } = useReadContract({
    address: marketplaceAddress,
    abi: marketplaceAbi,
    functionName: 'pending',
    args: address ? [address, NATIVE] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  if (!owed || owed === 0n) return null;

  return (
    <div className="mb-10 flex flex-col gap-4 rounded-lg border border-accent/40 bg-accent/8 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="tnum text-lg font-medium">
          <Price amount={owed} token={NATIVE} />
        </p>
        <p className="text-sm text-muted-foreground">
          Ready to withdraw — sale proceeds, royalties, and refunds from auctions
          you were outbid in.
        </p>
      </div>
      <Button
        variant="accent"
        disabled={isPending}
        onClick={() =>
          send({
            functionName: 'withdraw',
            args: [NATIVE],
            pendingMessage: 'Withdrawing…',
            successMessage: 'Withdrawn',
          }).then(() => refetch())
        }
      >
        <BanknoteIcon />
        Withdraw
      </Button>
    </div>
  );
}
