import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { getAddress, parseEther } from 'viem';

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

const PRICE = parseEther('1');

describe('Marketplace — listings', () => {
  let d: Deployed;
  let tokenId: bigint;

  beforeEach(async () => {
    d = await deployAll();
    tokenId = await mintApproved(d, d.seller);
  });

  async function listDefault(price = PRICE, royaltyless = true) {
    void royaltyless;
    await d.marketplace.write.list(
      [d.collection.address, tokenId, 1n, ZERO, price, await future(3600)],
      { account: d.seller.account },
    );
    return d.marketplace.read.nextListingId().then((id) => id - 1n);
  }

  it('lists and leaves custody with the seller', async () => {
    const listingId = await listDefault();
    const listing = await d.marketplace.read.listings([listingId]);

    assert.equal(getAddress(listing[0]), getAddress(d.seller.account.address));
    assert.equal(listing[2], PRICE);
    assert.equal(listing[4], true); // active

    // seller still holds it — this is an approval-based listing
    assert.equal(
      getAddress(await d.collection.read.ownerOf([tokenId])),
      getAddress(d.seller.account.address),
    );
  });

  it('transfers on buy and splits the proceeds', async () => {
    const listingId = await listDefault();

    await d.marketplace.write.buy([listingId, PRICE, ZERO], {
      account: d.buyer.account,
      value: PRICE,
    });

    assert.equal(
      getAddress(await d.collection.read.ownerOf([tokenId])),
      getAddress(d.buyer.account.address),
    );

    const { fee, seller } = split(PRICE);
    assert.equal(
      await d.marketplace.read.pending([d.seller.account.address, ZERO]),
      seller,
    );
    assert.equal(
      await d.marketplace.read.pending([d.admin.account.address, ZERO]),
      fee,
    );
  });

  it('pays the creator royalty on a secondary sale', async () => {
    const royaltyBps = 500n;
    const royaltyToken = await mintApproved(d, d.other, royaltyBps);

    // `other` minted it (so earns the royalty) and sells to buyer
    await d.marketplace.write.list(
      [
        d.collection.address,
        royaltyToken,
        1n,
        ZERO,
        PRICE,
        await future(3600),
      ],
      { account: d.other.account },
    );
    const listingId = (await d.marketplace.read.nextListingId()) - 1n;

    await d.marketplace.write.buy([listingId, PRICE, ZERO], {
      account: d.buyer.account,
      value: PRICE,
    });

    const { fee, royalty, seller } = split(PRICE, royaltyBps);
    // seller and royalty receiver are the same account here, so it gets both
    assert.equal(
      await d.marketplace.read.pending([d.other.account.address, ZERO]),
      seller + royalty,
    );
    assert.equal(
      await d.marketplace.read.pending([d.admin.account.address, ZERO]),
      fee,
    );
  });

  it('rejects a buy at the wrong price', async () => {
    const listingId = await listDefault();

    await rejectsWith(
      d.marketplace.write.buy([listingId, PRICE, ZERO], {
        account: d.buyer.account,
        value: PRICE - 1n,
      }),
      'WrongPayment',
    );
  });

  it('rejects a buy whose expected terms do not match the listing', async () => {
    const listingId = await listDefault();

    // buyer thinks the price is lower than it is — seller re-priced in front
    await rejectsWith(
      d.marketplace.write.buy([listingId, parseEther('0.5'), ZERO], {
        account: d.buyer.account,
        value: parseEther('0.5'),
      }),
      'TermsChanged',
    );
  });

  it('refuses a self-purchase', async () => {
    const listingId = await listDefault();

    await rejectsWith(
      d.marketplace.write.buy([listingId, PRICE, ZERO], {
        account: d.seller.account,
        value: PRICE,
      }),
      'SelfTrade',
    );
  });

  it('fails cleanly once the seller revokes approval', async () => {
    const listingId = await listDefault();

    await d.collection.write.setApprovalForAll(
      [d.marketplace.address, false],
      { account: d.seller.account },
    );

    await rejectsWith(
      d.marketplace.write.buy([listingId, PRICE, ZERO], {
        account: d.buyer.account,
        value: PRICE,
      }),
      'NotApproved',
    );

    // nothing partially applied
    assert.equal(
      getAddress(await d.collection.read.ownerOf([tokenId])),
      getAddress(d.seller.account.address),
    );
    assert.equal(
      await d.marketplace.read.pending([d.seller.account.address, ZERO]),
      0n,
    );
  });

  it('fails cleanly once the seller transfers the token away', async () => {
    const listingId = await listDefault();

    await d.collection.write.transferFrom(
      [d.seller.account.address, d.other.account.address, tokenId],
      { account: d.seller.account },
    );

    await rejectsWith(
      d.marketplace.write.buy([listingId, PRICE, ZERO], {
        account: d.buyer.account,
        value: PRICE,
      }),
      'NotTokenOwner',
    );
  });

  it('expires', async () => {
    await d.marketplace.write.list(
      [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(60)],
      { account: d.seller.account },
    );
    const listingId = (await d.marketplace.read.nextListingId()) - 1n;

    await networkHelpers.time.increase(120);

    await rejectsWith(
      d.marketplace.write.buy([listingId, PRICE, ZERO], {
        account: d.buyer.account,
        value: PRICE,
      }),
      'Expired',
    );
  });

  it('lets only the seller cancel, and only once', async () => {
    const listingId = await listDefault();

    await rejectsWith(
      d.marketplace.write.cancelListing([listingId], {
        account: d.buyer.account,
      }),
      'NotSeller',
    );

    await d.marketplace.write.cancelListing([listingId], {
      account: d.seller.account,
    });

    await rejectsWith(
      d.marketplace.write.cancelListing([listingId], {
        account: d.seller.account,
      }),
      'NotActive',
    );
  });

  it('rejects listing a token the caller does not own', async () => {
    await rejectsWith(
      d.marketplace.write.list(
        [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(3600)],
        { account: d.buyer.account },
      ),
      'NotTokenOwner',
    );
  });

  it('rejects zero price, bad expiry and a non-token collection', async () => {
    await rejectsWith(
      d.marketplace.write.list(
        [d.collection.address, tokenId, 1n, ZERO, 0n, await future(3600)],
        { account: d.seller.account },
      ),
      'ZeroPrice',
    );

    await rejectsWith(
      d.marketplace.write.list(
        [d.collection.address, tokenId, 1n, ZERO, PRICE, 1n],
        { account: d.seller.account },
      ),
      'BadExpiry',
    );

    // beyond MAX_DURATION
    await rejectsWith(
      d.marketplace.write.list(
        [
          d.collection.address,
          tokenId,
          1n,
          ZERO,
          PRICE,
          await future(400 * 24 * 3600),
        ],
        { account: d.seller.account },
      ),
      'BadExpiry',
    );

    const erc20 = await viem.deployContract('MockERC20');
    await rejectsWith(
      d.marketplace.write.list(
        [erc20.address, tokenId, 1n, ZERO, PRICE, await future(3600)],
        { account: d.seller.account },
      ),
      'UnsupportedCollection',
    );
  });

  it('rejects an ERC-721 listing with an amount other than 1', async () => {
    await rejectsWith(
      d.marketplace.write.list(
        [d.collection.address, tokenId, 2n, ZERO, PRICE, await future(3600)],
        { account: d.seller.account },
      ),
      'BadAmount',
    );
  });
});
