'use client';

import Link from 'next/link';
import { formatEther } from 'viem';

import { useForSale, marketStats, type Nft } from '@/hooks/use-market';
import { chain, NATIVE } from '@/lib/chain';
import { Artwork } from '@/components/artwork';
import { Countdown } from '@/components/countdown';
import { NftGrid } from '@/components/nft-grid';
import { Stat, PriceStat } from '@/components/stat';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** A live auction leads if there is one — a running clock is the most
 *  characteristic thing a marketplace has. Otherwise the newest listing. */
function pickFeature(nfts?: Nft[]) {
  if (!nfts?.length) return undefined;

  const live = nfts
    .filter((nft) => nft.auction && Number(nft.auction.endTime) * 1000 > Date.now())
    .sort((a, b) => (a.auction!.endTime < b.auction!.endTime ? -1 : 1));

  if (live.length > 0) return live[0];

  return nfts.filter((nft) => nft.listing).sort((a, b) => (a.tokenId > b.tokenId ? -1 : 1))[0];
}

export default function HomePage() {
  const { data, isLoading, error } = useForSale();
  const feature = pickFeature(data);
  const stats = marketStats(data);
  const rest = data?.filter((nft) => nft !== feature).slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
          Could not reach the marketplace: {error.message}
        </p>
      ) : isLoading ? (
        <Skeleton className="aspect-[16/10] rounded-xl sm:aspect-[21/9]" />
      ) : feature ? (
        <Feature nft={feature} />
      ) : (
        <Empty />
      )}

      {data && data.length > 0 && (
        <div className="mt-12 grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-4">
          <PriceStat label="Floor" amount={stats.floor} />
          <Stat label="For sale" value={stats.listed} />
          <Stat label="On auction" value={stats.auctions} />
          <Stat label="Items" value={stats.items} />
        </div>
      )}

      {(isLoading || (rest && rest.length > 0)) && (
        <section className="mt-12">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-tight">
              On the market
            </h2>
            <Link
              href="/nfts"
              className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              See everything
            </Link>
          </div>

          <NftGrid
            nfts={rest}
            isLoading={isLoading}
            error={error}
            empty="Nothing else is listed right now."
          />
        </section>
      )}
    </div>
  );
}

function Feature({ nft }: { nft: Nft }) {
  const auction = nft.auction;
  const href = `/nft/${nft.collection}/${nft.tokenId}`;

  const amount = auction
    ? auction.highestBid > 0n
      ? auction.highestBid
      : auction.reservePrice
    : nft.listing!.price;

  const token = auction ? auction.payToken : nft.listing!.payToken;

  return (
    <section className="grid overflow-hidden rounded-xl border bg-surface md:grid-cols-2">
      <Link href={href} className="block">
        <Artwork
          src={nft.image}
          alt={nft.name ?? `Token ${nft.tokenId}`}
          backgroundColor={nft.background_color}
          className="aspect-square w-full"
          priority
        />
      </Link>

      <div className="flex flex-col justify-center gap-6 p-8 lg:p-12">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">
            {nft.collectionName ?? 'Unknown collection'}
          </span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight lg:text-4xl">
            {nft.name ?? `Token #${nft.tokenId}`}
          </h1>
        </div>

        {nft.description && (
          <p className="line-clamp-3 max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground">
            {nft.description}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            {auction
              ? auction.highestBid > 0n
                ? 'Highest bid'
                : 'Reserve price'
              : 'Price'}
          </span>
          <p className="tnum text-3xl font-medium">
            {formatEther(amount)}
            <span className="ml-2 text-base text-muted-foreground">
              {token === NATIVE ? chain.nativeCurrency.symbol : 'ERC-20'}
            </span>
          </p>
          {auction && (
            <p className="mt-1 text-sm text-muted-foreground">
              Ends in <Countdown to={auction.endTime} />
            </p>
          )}
        </div>

        <Button size="lg" variant="accent" className="self-start" asChild>
          <Link href={href}>{auction ? 'View and bid' : 'View item'}</Link>
        </Button>
      </div>
    </section>
  );
}

function Empty() {
  return (
    <section className="flex flex-col items-start gap-6 rounded-xl border border-dashed px-8 py-16 sm:px-12 sm:py-24">
      <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        A marketplace where you keep your own keys, and your own contract.
      </h1>
      <p className="max-w-xl text-pretty leading-relaxed text-muted-foreground">
        Deploy your own ERC-721, mint into it, and list on your terms. Your
        token stays in your wallet until it actually sells — nothing is held in
        escrow but auctions, and proceeds are yours to claim.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" variant="accent" asChild>
          <Link href="/create">Create the first one</Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="/nfts">Browse the market</Link>
        </Button>
      </div>
    </section>
  );
}
