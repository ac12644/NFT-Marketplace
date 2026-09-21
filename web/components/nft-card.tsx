'use client';

import Link from 'next/link';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { GavelIcon, ShoppingBagIcon } from 'lucide-react';

import type { Nft } from '@/hooks/use-market';
import { useContractWrite } from '@/hooks/use-contract-write';
import { chain, NATIVE } from '@/lib/chain';
import { Artwork } from '@/components/artwork';
import { Countdown } from '@/components/countdown';
import { Button } from '@/components/ui/button';

/**
 * A quiet card: the artwork carries it, the chrome stays out of the way, and
 * the detail page carries everything else. Only the fastest action — buying at
 * the asking price — happens here.
 */
export function NftCard({ nft }: { nft: Nft }) {
  const { address } = useAccount();
  const isOwner = address ? nft.owner === address : false;
  const href = `/nft/${nft.collection}/${nft.tokenId}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border bg-surface transition-colors hover:border-foreground/25">
      <Link href={href} className="relative block">
        <Artwork
          src={nft.image}
          alt={nft.name ?? `Token ${nft.tokenId}`}
          backgroundColor={nft.background_color}
          className="aspect-square"
        />

        {nft.auction && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-background/92 px-2 py-1 font-mono text-xs backdrop-blur-sm">
            <GavelIcon className="size-3 text-accent" />
            <Countdown to={nft.auction.endTime} />
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <Link
            href={href}
            className="truncate font-medium transition-colors hover:text-accent"
          >
            {nft.name ?? `Token #${nft.tokenId}`}
          </Link>
          <span className="truncate text-xs text-muted-foreground">
            {nft.collectionName ?? 'Unknown collection'}
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-xs text-muted-foreground">
              {nft.auction
                ? nft.auction.highestBid > 0n
                  ? 'Highest bid'
                  : 'Reserve'
                : nft.listing
                  ? 'Price'
                  : nft.offers.length > 0
                    ? `${nft.offers.length} offer${nft.offers.length > 1 ? 's' : ''}`
                    : 'Not for sale'}
            </span>
            <span className="block truncate text-sm font-medium tnum">
              {nft.auction ? (
                <>
                  {formatEther(
                    nft.auction.highestBid > 0n
                      ? nft.auction.highestBid
                      : nft.auction.reservePrice,
                  )}{' '}
                  <Symbol token={nft.auction.payToken} />
                </>
              ) : nft.listing ? (
                <>
                  {formatEther(nft.listing.price)}{' '}
                  <Symbol token={nft.listing.payToken} />
                </>
              ) : (
                <span className="text-muted-foreground">Make an offer</span>
              )}
            </span>
          </div>

          {nft.listing && !isOwner && <QuickBuy nft={nft} />}
          {nft.auction && (
            <Button size="sm" variant="outline" asChild>
              <Link href={href}>Bid</Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Symbol({ token }: { token: `0x${string}` }) {
  return (
    <span className="text-muted-foreground">
      {token === NATIVE ? chain.nativeCurrency.symbol : 'ERC-20'}
    </span>
  );
}

function QuickBuy({ nft }: { nft: Nft }) {
  const { isConnected } = useAccount();
  const { send, isPending } = useContractWrite();
  const listing = nft.listing!;

  // Without a wallet there is nothing to click here; send them to the item
  // page rather than showing a button that cannot do anything.
  if (!isConnected) {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link href={`/nft/${nft.collection}/${nft.tokenId}`}>View</Link>
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="accent"
      disabled={isPending}
      onClick={() =>
        send({
          functionName: 'buy',
          args: [listing.id, listing.price, listing.payToken],
          value: listing.payToken === NATIVE ? listing.price : undefined,
          pendingMessage: 'Buying…',
          successMessage: 'Bought. It is yours.',
        })
      }
    >
      <ShoppingBagIcon />
      Buy
    </Button>
  );
}
