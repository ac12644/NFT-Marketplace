'use client';

import { useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { GavelIcon, ShoppingBagIcon, TagIcon, XIcon } from 'lucide-react';

import type { Nft } from '@/hooks/use-market';
import {
  useContractWrite,
  useCollectionApproval,
} from '@/hooks/use-contract-write';
import { useIsApproved } from '@/hooks/use-approval';
import { marketplaceAbi } from '@/lib/abi';
import { chain, marketplaceAddress, NATIVE } from '@/lib/chain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Countdown, useHasEnded } from '@/components/countdown';
import { ConnectButton } from '@/components/connect-button';
import { OffersDialog } from '@/components/offers-dialog';

const HOUR = 3600;
const expiryIn = (hours: number) =>
  BigInt(Math.floor(Date.now() / 1000) + hours * HOUR);

/**
 * The price and the action, together. Whatever state a token is in — on
 * auction, listed, owned and idle, or someone else's — this is the one place
 * that decides what can be done about it.
 */
export function TradePanel({ nft }: { nft: Nft }) {
  const { address, isConnected } = useAccount();
  const isOwner = address ? nft.owner === address : false;

  if (nft.auction) return <AuctionPanel nft={nft} isConnected={isConnected} />;
  if (nft.listing) return <ListingPanel nft={nft} isOwner={isOwner} />;
  if (isOwner) return <OwnerPanel nft={nft} />;

  return (
    <Shell caption="Not for sale">
      <p className="text-sm text-muted-foreground">
        This token has no live listing. You can still make an offer — the owner
        can accept it at any time.
      </p>
      <OffersDialog nft={nft} isOwner={false} />
    </Shell>
  );
}

function Shell({
  caption,
  headline,
  children,
}: {
  caption: string;
  headline?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{caption}</span>
        {headline}
      </div>
      {children}
    </section>
  );
}

function Money({ amount, token }: { amount: bigint; token: `0x${string}` }) {
  return (
    <p className="tnum text-3xl font-medium">
      {formatEther(amount)}
      <span className="ml-2 text-base text-muted-foreground">
        {token === NATIVE ? chain.nativeCurrency.symbol : 'ERC-20'}
      </span>
    </p>
  );
}

function ListingPanel({ nft, isOwner }: { nft: Nft; isOwner: boolean }) {
  const { isConnected } = useAccount();
  const { send, isPending } = useContractWrite();
  const listing = nft.listing!;

  return (
    <Shell
      caption="Price"
      headline={<Money amount={listing.price} token={listing.payToken} />}
    >
      {isOwner ? (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            send({
              functionName: 'cancelListing',
              args: [listing.id],
              pendingMessage: 'Cancelling…',
              successMessage: 'Listing cancelled',
            })
          }
        >
          <XIcon />
          Cancel listing
        </Button>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {!isConnected ? (
            <ConnectButton />
          ) : (
          <Button
            variant="accent"
            size="lg"
            className="flex-1"
            disabled={isPending}
            onClick={() =>
              send({
                functionName: 'buy',
                // The terms we saw, so a re-price in front of us reverts.
                args: [listing.id, listing.price, listing.payToken],
                value: listing.payToken === NATIVE ? listing.price : undefined,
                pendingMessage: 'Buying…',
                successMessage: 'Bought. It is yours.',
              })
            }
          >
            <ShoppingBagIcon />
            Buy now
          </Button>
          )}
          <OffersDialog nft={nft} isOwner={false} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        The seller keeps this token until the sale settles, so it can only be
        bought while they still hold it.
      </p>
    </Shell>
  );
}

function AuctionPanel({
  nft,
  isConnected,
}: {
  nft: Nft;
  isConnected: boolean;
}) {
  const auction = nft.auction!;
  const { address } = useAccount();
  const [amount, setAmount] = useState('');
  const { send, isPending } = useContractWrite();

  const { data: incrementBps } = useReadContract({
    address: marketplaceAddress,
    abi: marketplaceAbi,
    functionName: 'MIN_BID_INCREMENT_BPS',
    query: { staleTime: Infinity },
  });

  const ended = useHasEnded(auction.endTime);
  const isSeller = address ? auction.seller === address : false;
  const leading = address ? auction.highestBidder === address : false;

  const minimum =
    auction.highestBid === 0n
      ? auction.reservePrice
      : incrementBps === undefined
        ? undefined
        : auction.highestBid + (auction.highestBid * incrementBps) / 10_000n;

  let parsed: bigint | null = null;
  try {
    parsed = amount ? parseEther(amount) : null;
  } catch {
    parsed = null;
  }
  const valid = parsed !== null && minimum !== undefined && parsed >= minimum;

  return (
    <Shell
      caption={auction.highestBid > 0n ? 'Highest bid' : 'Reserve price'}
      headline={
        <>
          <Money
            amount={
              auction.highestBid > 0n
                ? auction.highestBid
                : auction.reservePrice
            }
            token={auction.payToken}
          />
          <p className="mt-2 text-sm text-muted-foreground">
            {ended ? (
              'Bidding has closed'
            ) : (
              <>
                Ends in <Countdown to={auction.endTime} />
              </>
            )}
          </p>
        </>
      }
    >
      {leading && !ended && (
        <p className="rounded-md bg-accent/12 px-3 py-2 text-sm">
          You hold the highest bid.
        </p>
      )}

      {ended ? (
        <Button
          variant="accent"
          disabled={isPending}
          onClick={() =>
            send({
              functionName: 'settleAuction',
              args: [auction.id],
              pendingMessage: 'Settling…',
              successMessage: 'Auction settled',
            })
          }
        >
          <GavelIcon />
          Settle auction
        </Button>
      ) : isSeller ? (
        <p className="text-sm text-muted-foreground">
          Your auction is live. It can be settled by anyone once the clock runs
          out.
        </p>
      ) : (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            send({
              functionName: 'bid',
              args: [auction.id, parsed],
              value: auction.payToken === NATIVE ? parsed! : undefined,
              pendingMessage: 'Placing bid…',
              successMessage: 'Bid placed',
            }).then(() => setAmount(''));
          }}
        >
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={
              minimum === undefined
                ? 'Amount'
                : `${formatEther(minimum)} or more`
            }
            inputMode="decimal"
            aria-label="Bid amount"
            aria-invalid={amount !== '' && !valid}
            disabled={!isConnected}
            className="tnum"
          />
          <Button
            type="submit"
            variant="accent"
            disabled={!valid || isPending || !isConnected}
          >
            <GavelIcon />
            {isConnected ? 'Place bid' : 'Connect'}
          </Button>
        </form>
      )}

      <p className="text-xs text-muted-foreground">
        Outbid bidders are refunded to their marketplace balance, claimable from
        My NFTs. A bid in the last ten minutes extends the clock.
      </p>
    </Shell>
  );
}

function OwnerPanel({ nft }: { nft: Nft }) {
  const [mode, setMode] = useState<'sell' | 'auction'>('sell');
  const [value, setValue] = useState('');
  const { isApproved, isLoading } = useIsApproved(nft.collection);
  const { approve, isPending: approving } = useCollectionApproval(
    nft.collection,
  );
  const { send, isPending } = useContractWrite();

  let parsed: bigint | null = null;
  try {
    parsed = value ? parseEther(value) : null;
  } catch {
    parsed = null;
  }
  const valid = parsed !== null && parsed > 0n;

  if (isLoading) return null;

  if (!isApproved) {
    return (
      <Shell caption="You own this">
        <p className="text-sm text-muted-foreground">
          Approve the marketplace once and you can list anything from this
          collection. The token stays in your wallet until it sells.
        </p>
        <Button variant="accent" disabled={approving} onClick={() => approve()}>
          Approve marketplace
        </Button>
      </Shell>
    );
  }

  return (
    <Shell caption="You own this">
      <div className="flex gap-1 rounded-md bg-muted p-1">
        {(
          [
            ['sell', 'Fixed price'],
            ['auction', 'Auction'],
          ] as const
        ).map(([option, label]) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            aria-pressed={mode === option}
            className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors ${
              mode === option
                ? 'bg-surface font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          send(
            mode === 'sell'
              ? {
                  functionName: 'list',
                  args: [
                    nft.collection,
                    nft.tokenId,
                    1n,
                    NATIVE,
                    parsed,
                    expiryIn(24 * 30),
                  ],
                  pendingMessage: 'Listing…',
                  successMessage: 'Listed for sale',
                }
              : {
                  functionName: 'createAuction',
                  args: [
                    nft.collection,
                    nft.tokenId,
                    1n,
                    NATIVE,
                    parsed,
                    expiryIn(24),
                  ],
                  pendingMessage: 'Opening auction…',
                  successMessage: 'Auction is live for 24 hours',
                },
          ).then(() => setValue(''));
        }}
      >
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={
            mode === 'sell'
              ? `Price in ${chain.nativeCurrency.symbol}`
              : `Reserve in ${chain.nativeCurrency.symbol}`
          }
          inputMode="decimal"
          aria-label={mode === 'sell' ? 'Listing price' : 'Reserve price'}
          aria-invalid={value !== '' && !valid}
          className="font-mono"
        />
        <Button type="submit" variant="accent" disabled={!valid || isPending}>
          {mode === 'sell' ? <TagIcon /> : <GavelIcon />}
          {mode === 'sell' ? 'List' : 'Open auction'}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        {mode === 'sell'
          ? 'Listings run for 30 days and you keep the token until it sells.'
          : 'Auctions run for 24 hours and the token is held in escrow until settled.'}
      </p>

      <OffersDialog nft={nft} isOwner />
    </Shell>
  );
}
