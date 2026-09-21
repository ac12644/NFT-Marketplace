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

describe('Marketplace — offers', () => {
  let d: Deployed;
  let tokenId: bigint;

  beforeEach(async () => {
    d = await deployAll();
    tokenId = await mintApproved(d, d.seller);
  });

  async function offerNative(price = PRICE) {
    await d.marketplace.write.makeOffer(
      [d.collection.address, tokenId, 1n, ZERO, price, await future(3600)],
      { account: d.buyer.account, value: price },
    );
    return (await d.marketplace.read.nextOfferId()) - 1n;
  }

  it('escrows the funds when the offer is made', async () => {
    const before = await viem
      .getPublicClient()
      .then((c) => c.getBalance({ address: d.marketplace.address }));

    await offerNative();

    const after = await viem
      .getPublicClient()
      .then((c) => c.getBalance({ address: d.marketplace.address }));

    assert.equal(after - before, PRICE);
  });

  it('can be offered on a token that is not listed', async () => {
    const offerId = await offerNative();
    const offer = await d.marketplace.read.offers([offerId]);

    assert.equal(getAddress(offer[0]), getAddress(d.buyer.account.address));
    assert.equal(offer[4], true); // active
  });

  it('settles when the owner accepts', async () => {
    const offerId = await offerNative();

    await d.marketplace.write.acceptOffer([offerId], {
      account: d.seller.account,
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

  it('refuses acceptance from someone who does not own the token', async () => {
    const offerId = await offerNative();

    await rejectsWith(
      d.marketplace.write.acceptOffer([offerId], { account: d.other.account }),
      'NotTokenOwner',
    );
  });

  it('refuses the buyer accepting their own offer', async () => {
    const offerId = await offerNative();

    await rejectsWith(
      d.marketplace.write.acceptOffer([offerId], { account: d.buyer.account }),
      'SelfTrade',
    );
  });

  it('refunds the escrow on cancel, claimable by withdraw', async () => {
    const offerId = await offerNative();

    await d.marketplace.write.cancelOffer([offerId], {
      account: d.buyer.account,
    });

    assert.equal(
      await d.marketplace.read.pending([d.buyer.account.address, ZERO]),
      PRICE,
    );

    await rejectsWith(
      d.marketplace.write.acceptOffer([offerId], {
        account: d.seller.account,
      }),
      'NotActive',
    );
  });

  it('lets only the buyer cancel', async () => {
    const offerId = await offerNative();

    await rejectsWith(
      d.marketplace.write.cancelOffer([offerId], {
        account: d.seller.account,
      }),
      'NotBuyer',
    );
  });

  it('cannot be accepted after expiry, but escrow is still recoverable', async () => {
    await d.marketplace.write.makeOffer(
      [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(60)],
      { account: d.buyer.account, value: PRICE },
    );
    const offerId = (await d.marketplace.read.nextOfferId()) - 1n;

    await networkHelpers.time.increase(120);

    await rejectsWith(
      d.marketplace.write.acceptOffer([offerId], {
        account: d.seller.account,
      }),
      'Expired',
    );

    // the buyer is not stuck — cancel still works after expiry
    await d.marketplace.write.cancelOffer([offerId], {
      account: d.buyer.account,
    });
    assert.equal(
      await d.marketplace.read.pending([d.buyer.account.address, ZERO]),
      PRICE,
    );
  });

  describe('ERC-20 payment', () => {
    it('escrows and settles in an allowlisted token', async () => {
      const erc20 = await viem.deployContract('MockERC20');
      await erc20.write.mint([d.buyer.account.address, PRICE]);

      await d.marketplace.write.setPayToken([erc20.address, true], {
        account: d.admin.account,
      });
      await erc20.write.approve([d.marketplace.address, PRICE], {
        account: d.buyer.account,
      });

      await d.marketplace.write.makeOffer(
        [
          d.collection.address,
          tokenId,
          1n,
          erc20.address,
          PRICE,
          await future(3600),
        ],
        { account: d.buyer.account },
      );
      const offerId = (await d.marketplace.read.nextOfferId()) - 1n;

      assert.equal(await erc20.read.balanceOf([d.marketplace.address]), PRICE);

      await d.marketplace.write.acceptOffer([offerId], {
        account: d.seller.account,
      });

      const { seller } = split(PRICE);
      assert.equal(
        await d.marketplace.read.pending([
          d.seller.account.address,
          erc20.address,
        ]),
        seller,
      );

      await d.marketplace.write.withdraw([erc20.address], {
        account: d.seller.account,
      });
      assert.equal(
        await erc20.read.balanceOf([d.seller.account.address]),
        seller,
      );
    });

    it('rejects a token that is not allowlisted', async () => {
      const erc20 = await viem.deployContract('MockERC20');

      await rejectsWith(
        d.marketplace.write.makeOffer(
          [
            d.collection.address,
            tokenId,
            1n,
            erc20.address,
            PRICE,
            await future(3600),
          ],
          { account: d.buyer.account },
        ),
        'PayTokenNotAllowed',
      );
    });

    it('rejects native value sent alongside an ERC-20 offer', async () => {
      const erc20 = await viem.deployContract('MockERC20');
      await erc20.write.mint([d.buyer.account.address, PRICE]);
      await d.marketplace.write.setPayToken([erc20.address, true], {
        account: d.admin.account,
      });
      await erc20.write.approve([d.marketplace.address, PRICE], {
        account: d.buyer.account,
      });

      await rejectsWith(
        d.marketplace.write.makeOffer(
          [
            d.collection.address,
            tokenId,
            1n,
            erc20.address,
            PRICE,
            await future(3600),
          ],
          { account: d.buyer.account, value: 1n },
        ),
        'UnexpectedNative',
      );
    });
  });
});
