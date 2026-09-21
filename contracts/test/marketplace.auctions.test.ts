import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { getAddress, parseEther, encodeFunctionData } from 'viem';

import {
  deployAll,
  future,
  mintApproved,
  networkHelpers,
  rejectsWith,
  split,
  viem,
  ZERO,
  type Deployed,
} from './helpers.js';

const RESERVE = parseEther('1');

describe('Marketplace — auctions', () => {
  let d: Deployed;
  let tokenId: bigint;

  beforeEach(async () => {
    d = await deployAll();
    tokenId = await mintApproved(d, d.seller);
  });

  async function createAuction(durationSeconds = 3600) {
    await d.marketplace.write.createAuction(
      [
        d.collection.address,
        tokenId,
        1n,
        ZERO,
        RESERVE,
        await future(durationSeconds),
      ],
      { account: d.seller.account },
    );
    return (await d.marketplace.read.nextAuctionId()) - 1n;
  }

  it('escrows the asset on creation', async () => {
    await createAuction();

    assert.equal(
      getAddress(await d.collection.read.ownerOf([tokenId])),
      getAddress(d.marketplace.address),
    );
  });

  it('rejects a first bid below the reserve', async () => {
    const auctionId = await createAuction();

    await rejectsWith(
      d.marketplace.write.bid([auctionId, RESERVE - 1n], {
        account: d.buyer.account,
        value: RESERVE - 1n,
      }),
      'BidTooLow',
    );
  });

  it('requires each bid to beat the last by the increment', async () => {
    const auctionId = await createAuction();

    await d.marketplace.write.bid([auctionId, RESERVE], {
      account: d.buyer.account,
      value: RESERVE,
    });

    // +1 wei is not enough; the increment is 5%
    await rejectsWith(
      d.marketplace.write.bid([auctionId, RESERVE + 1n], {
        account: d.other.account,
        value: RESERVE + 1n,
      }),
      'BidTooLow',
    );

    const incrementBps = await d.marketplace.read.MIN_BID_INCREMENT_BPS();
    const enough = RESERVE + (RESERVE * incrementBps) / 10_000n;
    await d.marketplace.write.bid([auctionId, enough], {
      account: d.other.account,
      value: enough,
    });

    const auction = await d.marketplace.read.auctions([auctionId]);
    assert.equal(getAddress(auction[4]), getAddress(d.other.account.address));
  });

  it('credits an outbid bidder for withdrawal', async () => {
    const auctionId = await createAuction();

    await d.marketplace.write.bid([auctionId, RESERVE], {
      account: d.buyer.account,
      value: RESERVE,
    });

    const higher = RESERVE * 2n;
    await d.marketplace.write.bid([auctionId, higher], {
      account: d.other.account,
      value: higher,
    });

    assert.equal(
      await d.marketplace.read.pending([d.buyer.account.address, ZERO]),
      RESERVE,
    );
  });

  it('extends when a bid lands inside the closing window', async () => {
    const auctionId = await createAuction(3600);
    const before = (await d.marketplace.read.auctions([auctionId]))[5];

    // jump to one minute before the close — inside the 10 minute window
    await networkHelpers.time.increase(3600 - 60);

    await d.marketplace.write.bid([auctionId, RESERVE], {
      account: d.buyer.account,
      value: RESERVE,
    });

    const after = (await d.marketplace.read.auctions([auctionId]))[5];
    assert.ok(after > before, 'auction should have been extended');

    const extension = await d.marketplace.read.AUCTION_EXTENSION();
    const now = BigInt(await networkHelpers.time.latest());
    assert.equal(after, now + extension);
  });

  it('does not extend for an early bid', async () => {
    const auctionId = await createAuction(3600);
    const before = (await d.marketplace.read.auctions([auctionId]))[5];

    await d.marketplace.write.bid([auctionId, RESERVE], {
      account: d.buyer.account,
      value: RESERVE,
    });

    assert.equal((await d.marketplace.read.auctions([auctionId]))[5], before);
  });

  it('settles to the winner and splits the proceeds', async () => {
    const auctionId = await createAuction(600);

    await d.marketplace.write.bid([auctionId, RESERVE], {
      account: d.buyer.account,
      value: RESERVE,
    });

    await networkHelpers.time.increase(1200);
    // anyone can settle
    await d.marketplace.write.settleAuction([auctionId], {
      account: d.other.account,
    });

    assert.equal(
      getAddress(await d.collection.read.ownerOf([tokenId])),
      getAddress(d.buyer.account.address),
    );

    const { fee, seller } = split(RESERVE);
    assert.equal(
      await d.marketplace.read.pending([d.seller.account.address, ZERO]),
      seller,
    );
    assert.equal(
      await d.marketplace.read.pending([d.admin.account.address, ZERO]),
      fee,
    );
  });

  it('returns the asset when nobody bids', async () => {
    const auctionId = await createAuction(600);

    await networkHelpers.time.increase(1200);
    await d.marketplace.write.settleAuction([auctionId], {
      account: d.other.account,
    });

    assert.equal(
      getAddress(await d.collection.read.ownerOf([tokenId])),
      getAddress(d.seller.account.address),
    );
  });

  it('cannot be settled early or twice', async () => {
    const auctionId = await createAuction(600);

    await rejectsWith(
      d.marketplace.write.settleAuction([auctionId], {
        account: d.other.account,
      }),
      'AuctionLive',
    );

    await networkHelpers.time.increase(1200);
    await d.marketplace.write.settleAuction([auctionId], {
      account: d.other.account,
    });

    await rejectsWith(
      d.marketplace.write.settleAuction([auctionId], {
        account: d.other.account,
      }),
      'AlreadySettled',
    );
  });

  it('can be cancelled before any bid, returning the asset', async () => {
    const auctionId = await createAuction();

    await d.marketplace.write.cancelAuction([auctionId], {
      account: d.seller.account,
    });

    assert.equal(
      getAddress(await d.collection.read.ownerOf([tokenId])),
      getAddress(d.seller.account.address),
    );
  });

  it('cannot be cancelled once bid on', async () => {
    const auctionId = await createAuction();

    await d.marketplace.write.bid([auctionId, RESERVE], {
      account: d.buyer.account,
      value: RESERVE,
    });

    await rejectsWith(
      d.marketplace.write.cancelAuction([auctionId], {
        account: d.seller.account,
      }),
      'AuctionHasBids',
    );
  });

  it('refuses bids from the seller and after close', async () => {
    const auctionId = await createAuction(600);

    await rejectsWith(
      d.marketplace.write.bid([auctionId, RESERVE], {
        account: d.seller.account,
        value: RESERVE,
      }),
      'SelfTrade',
    );

    await networkHelpers.time.increase(1200);
    await rejectsWith(
      d.marketplace.write.bid([auctionId, RESERVE], {
        account: d.buyer.account,
        value: RESERVE,
      }),
      'Expired',
    );
  });

  // The failure mode this design exists to prevent: a bidder who cannot
  // receive native currency must not be able to stall the auction.
  it('an outbid bidder that rejects native transfers cannot block anything', async () => {
    const auctionId = await createAuction(600);

    const hostile = await viem.deployContract('RevertingReceiver', [
      d.marketplace.address,
    ]);
    await hostile.write.fund({ value: RESERVE * 4n });

    const bidData = (amount: bigint) =>
      encodeFunctionData({
        abi: d.marketplace.abi,
        functionName: 'bid',
        args: [auctionId, amount],
      });

    await hostile.write.execute([RESERVE, bidData(RESERVE)]);

    // outbid it — crediting, not pushing, so this cannot revert
    const higher = RESERVE * 2n;
    await d.marketplace.write.bid([auctionId, higher], {
      account: d.buyer.account,
      value: higher,
    });

    assert.equal(
      await d.marketplace.read.pending([hostile.address, ZERO]),
      RESERVE,
    );

    // and the auction settles normally
    await networkHelpers.time.increase(1200);
    await d.marketplace.write.settleAuction([auctionId], {
      account: d.other.account,
    });
    assert.equal(
      getAddress(await d.collection.read.ownerOf([tokenId])),
      getAddress(d.buyer.account.address),
    );

    // the hostile contract's own withdraw reverts — its problem, nobody else's
    await rejectsWith(
      hostile.write.execute([
        0n,
        encodeFunctionData({
          abi: d.marketplace.abi,
          functionName: 'withdraw',
          args: [ZERO],
        }),
      ]),
      'call failed',
    );
  });
});
