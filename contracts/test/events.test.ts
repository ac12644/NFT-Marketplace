import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { getAddress, parseEther } from 'viem';

import {
  deployAll,
  future,
  mintApproved,
  networkHelpers,
  viem,
  ZERO,
  FEE_BPS,
  BPS,
  type Deployed,
} from './helpers.js';

const PRICE = parseEther('1');

/*
 * An indexer should be able to consume any terminal event on its own. If it
 * has to join back against the creation event to learn what was traded, the
 * event is under-specified.
 */
describe('Events are self-describing', () => {
  let d: Deployed;

  beforeEach(async () => {
    d = await deployAll();
  });

  async function eventsIn(hash: `0x${string}`, eventName: string) {
    const publicClient = await viem.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return publicClient.getContractEvents({
      address: d.marketplace.address,
      abi: d.marketplace.abi,
      eventName: eventName as never,
      blockHash: receipt.blockHash,
    });
  }

  it('Sold names the asset, both parties, the price and the fee', async () => {
    const tokenId = await mintApproved(d, d.seller);
    await d.marketplace.write.list(
      [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(3600)],
      { account: d.seller.account },
    );
    const listingId = (await d.marketplace.read.nextListingId()) - 1n;

    const hash = await d.marketplace.write.buy([listingId, PRICE, ZERO], {
      account: d.buyer.account,
      value: PRICE,
    });

    const [sold] = await eventsIn(hash, 'Sold');
    const args = sold.args as Record<string, unknown>;

    assert.equal(args.listingId, listingId);
    assert.equal(
      getAddress(args.collection as string),
      getAddress(d.collection.address),
    );
    assert.equal(args.tokenId, tokenId);
    assert.equal(
      getAddress(args.seller as string),
      getAddress(d.seller.account.address),
    );
    assert.equal(
      getAddress(args.buyer as string),
      getAddress(d.buyer.account.address),
    );
    assert.equal(args.amount, 1n);
    assert.equal(args.price, PRICE);
    assert.equal(args.fee, (PRICE * FEE_BPS) / BPS);
  });

  it('AuctionSettled names the asset, seller and winner', async () => {
    const tokenId = await mintApproved(d, d.seller);
    await d.marketplace.write.createAuction(
      [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(600)],
      { account: d.seller.account },
    );
    const auctionId = (await d.marketplace.read.nextAuctionId()) - 1n;
    await d.marketplace.write.bid([auctionId, PRICE], {
      account: d.buyer.account,
      value: PRICE,
    });

    await networkHelpers.time.increase(1200);
    const hash = await d.marketplace.write.settleAuction([auctionId], {
      account: d.other.account,
    });

    const [settled] = await eventsIn(hash, 'AuctionSettled');
    const args = settled.args as Record<string, unknown>;

    assert.equal(
      getAddress(args.collection as string),
      getAddress(d.collection.address),
    );
    assert.equal(args.tokenId, tokenId);
    assert.equal(
      getAddress(args.seller as string),
      getAddress(d.seller.account.address),
    );
    assert.equal(
      getAddress(args.winner as string),
      getAddress(d.buyer.account.address),
    );
    assert.equal(args.amount, PRICE);
  });

  it('BidPlaced reports the end time, so extensions are visible in the log', async () => {
    const tokenId = await mintApproved(d, d.seller);
    await d.marketplace.write.createAuction(
      [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(3600)],
      { account: d.seller.account },
    );
    const auctionId = (await d.marketplace.read.nextAuctionId()) - 1n;

    // bid inside the closing window so the auction extends
    await networkHelpers.time.increase(3600 - 60);
    const hash = await d.marketplace.write.bid([auctionId, PRICE], {
      account: d.buyer.account,
      value: PRICE,
    });

    const [bid] = await eventsIn(hash, 'BidPlaced');
    const onChain = (await d.marketplace.read.auctions([auctionId]))[5];

    assert.equal((bid.args as Record<string, unknown>).endTime, onChain);
  });

  it('cancellations name the asset too', async () => {
    const tokenId = await mintApproved(d, d.seller);
    await d.marketplace.write.list(
      [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(3600)],
      { account: d.seller.account },
    );
    const listingId = (await d.marketplace.read.nextListingId()) - 1n;

    const hash = await d.marketplace.write.cancelListing([listingId], {
      account: d.seller.account,
    });

    const [cancelled] = await eventsIn(hash, 'ListingCancelled');
    const args = cancelled.args as Record<string, unknown>;

    assert.equal(
      getAddress(args.collection as string),
      getAddress(d.collection.address),
    );
    assert.equal(args.tokenId, tokenId);
  });

  it('indexes every order event by (orderId, collection, tokenId)', async () => {
    const indexedOf = (name: string) => {
      const entry = d.marketplace.abi.find(
        (e) => e.type === 'event' && e.name === name,
      ) as { inputs: { name: string; indexed?: boolean }[] } | undefined;
      assert.ok(entry, `${name} should exist`);
      return entry!.inputs.filter((i) => i.indexed).map((i) => i.name);
    };

    for (const [name, id] of [
      ['Listed', 'listingId'],
      ['ListingCancelled', 'listingId'],
      ['Sold', 'listingId'],
      ['OfferMade', 'offerId'],
      ['OfferCancelled', 'offerId'],
      ['OfferAccepted', 'offerId'],
      ['AuctionCreated', 'auctionId'],
      ['BidPlaced', 'auctionId'],
      ['AuctionSettled', 'auctionId'],
      ['AuctionCancelled', 'auctionId'],
    ] as const) {
      assert.deepEqual(
        indexedOf(name),
        [id, 'collection', 'tokenId'],
        `${name} should be filterable by order id, collection and token`,
      );
    }
  });
});
