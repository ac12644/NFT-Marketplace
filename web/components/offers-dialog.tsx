'use client';

import { useState } from 'react';
import { parseEther } from 'viem';
import { useAccount } from 'wagmi';
import { CheckIcon, HandCoinsIcon, XIcon } from 'lucide-react';

import type { Nft } from '@/hooks/use-market';
import { useContractWrite } from '@/hooks/use-contract-write';
import { chain, NATIVE } from '@/lib/chain';
import { shortAddress } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Price } from '@/components/price';
import { Countdown } from '@/components/countdown';
import { Traits } from '@/components/traits';

export function OffersDialog({
  nft,
  isOwner,
}: {
  nft: Nft;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { send, isPending } = useContractWrite();
  const [amount, setAmount] = useState('');

  let parsed: bigint | null = null;
  try {
    parsed = amount ? parseEther(amount) : null;
  } catch {
    parsed = null;
  }
  const valid = parsed !== null && parsed > 0n;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <HandCoinsIcon />
          {nft.offers.length > 0
            ? `${nft.offers.length} offer${nft.offers.length > 1 ? 's' : ''}`
            : 'Make an offer'}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{nft.name ?? `Token #${nft.tokenId}`}</DialogTitle>
          <DialogDescription>
            Offers escrow your funds until they are accepted, cancelled or
            expire.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {nft.attributes && nft.attributes.length > 0 && (
            <Traits attributes={nft.attributes} />
          )}

          {nft.offers.length > 0 && (
            <ul className="flex flex-col gap-2">
              {nft.offers.map((offer) => {
                const mine = address ? offer.buyer === address : false;
                return (
                  <li
                    key={offer.id.toString()}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        <Price amount={offer.price} token={offer.payToken} />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {mine ? 'You' : shortAddress(offer.buyer)} · expires in{' '}
                        <Countdown to={offer.expiry} />
                      </p>
                    </div>

                    {isOwner && !mine && (
                      <Button
                        size="sm"
                        variant="accent"
                        disabled={isPending}
                        onClick={() =>
                          send({
                            functionName: 'acceptOffer',
                            args: [offer.id],
                            pendingMessage: 'Accepting…',
                            successMessage: 'Offer accepted',
                          }).then(() => setOpen(false))
                        }
                      >
                        <CheckIcon />
                        Accept
                      </Button>
                    )}

                    {mine && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() =>
                          send({
                            functionName: 'cancelOffer',
                            args: [offer.id],
                            pendingMessage: 'Cancelling…',
                            successMessage: 'Offer withdrawn',
                          })
                        }
                      >
                        <XIcon />
                        Withdraw
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!isOwner && (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!valid) return;
                send({
                  functionName: 'makeOffer',
                  args: [
                    nft.collection,
                    nft.tokenId,
                    1n,
                    NATIVE,
                    parsed,
                    BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600),
                  ],
                  value: parsed!,
                  pendingMessage: 'Placing offer…',
                  successMessage: 'Offer placed for 7 days',
                }).then(() => {
                  setAmount('');
                  setOpen(false);
                });
              }}
            >
              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={`Offer in ${chain.nativeCurrency.symbol}`}
                inputMode="decimal"
                aria-label="Offer amount"
                aria-invalid={amount !== '' && !valid}
                disabled={!isConnected}
              />
              <Button type="submit" disabled={!valid || isPending || !isConnected}>
                Offer
              </Button>
            </form>
          )}

          {isOwner && nft.offers.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No offers yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
