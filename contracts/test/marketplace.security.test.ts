import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { getAddress, parseEther, toFunctionSelector } from 'viem';

import {
  deployAll,
  future,
  mintApproved,
  networkHelpers,
  rejectsWith,
  split,
  viem,
  ZERO,
  FEE_BPS,
  BPS,
  type Deployed,
} from './helpers.js';

const PRICE = parseEther('1');

describe('Marketplace — security', () => {
  let d: Deployed;

  beforeEach(async () => {
    d = await deployAll();
  });

  describe('reentrancy', () => {
    it('blocks re-entry from onERC721Received during a buy', async () => {
      const tokenId = await mintApproved(d, d.seller);

      await d.marketplace.write.list(
        [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(3600)],
        { account: d.seller.account },
      );
      const listingId = (await d.marketplace.read.nextListingId()) - 1n;

      const attacker = await viem.deployContract('ReentrantBuyer', [
        d.marketplace.address,
      ]);

      // fund it with more than the price so a second buy would be affordable
      await d.buyer.sendTransaction({
        to: attacker.address,
        value: PRICE * 3n,
      });

      await attacker.write.attack([listingId, PRICE], {
        account: d.buyer.account,
      });

      // the callback fired, so the re-entrant path really was exercised
      assert.equal(await attacker.read.reentered(), true);

      // and it was the transient-storage guard that stopped it, not merely the
      // listing already being inactive — assert the exact revert selector
      assert.equal(
        await attacker.read.lastRevert(),
        toFunctionSelector('ReentrancyGuardReentrantCall()'),
      );

      // the outer purchase still completed
      assert.equal(
        getAddress(await d.collection.read.ownerOf([tokenId])),
        getAddress(attacker.address),
      );

      // and the seller was paid exactly once
      const { seller } = split(PRICE);
      assert.equal(
        await d.marketplace.read.pending([d.seller.account.address, ZERO]),
        seller,
      );
    });
  });

  describe('hostile collections', () => {
    async function sellVia(mode: number) {
      const bad = await viem.deployContract('MaliciousRoyalty', [
        mode,
        d.other.account.address,
      ]);
      await bad.write.mint([d.seller.account.address, 1n]);
      await bad.write.setApprovalForAll([d.marketplace.address, true], {
        account: d.seller.account,
      });

      await d.marketplace.write.list(
        [bad.address, 1n, 1n, ZERO, PRICE, await future(3600)],
        { account: d.seller.account },
      );
      const listingId = (await d.marketplace.read.nextListingId()) - 1n;

      await d.marketplace.write.buy([listingId, PRICE, ZERO], {
        account: d.buyer.account,
        value: PRICE,
      });

      return bad;
    }

    it('a reverting royaltyInfo degrades to no royalty instead of bricking sales', async () => {
      await sellVia(0); // Mode.Revert

      assert.equal(
        await d.marketplace.read.pending([d.other.account.address, ZERO]),
        0n,
      );
      // seller still paid in full, minus only the protocol fee
      assert.equal(
        await d.marketplace.read.pending([d.seller.account.address, ZERO]),
        PRICE - (PRICE * FEE_BPS) / BPS,
      );
    });

    it('a royalty claiming the whole sale is clamped to the cap', async () => {
      await sellVia(1); // Mode.TakeEverything

      const cap = await d.marketplace.read.MAX_ROYALTY_BPS();
      const clamped = (PRICE * cap) / BPS;

      assert.equal(
        await d.marketplace.read.pending([d.other.account.address, ZERO]),
        clamped,
      );

      const fee = (PRICE * FEE_BPS) / BPS;
      assert.equal(
        await d.marketplace.read.pending([d.seller.account.address, ZERO]),
        PRICE - fee - clamped,
      );
    });
  });

  describe('ERC-1155', () => {
    it('lists and sells a quantity', async () => {
      const erc1155 = await viem.deployContract('MockERC1155');
      await erc1155.write.mint([d.seller.account.address, 7n, 10n]);
      await erc1155.write.setApprovalForAll([d.marketplace.address, true], {
        account: d.seller.account,
      });

      await d.marketplace.write.list(
        [erc1155.address, 7n, 3n, ZERO, PRICE, await future(3600)],
        { account: d.seller.account },
      );
      const listingId = (await d.marketplace.read.nextListingId()) - 1n;

      await d.marketplace.write.buy([listingId, PRICE, ZERO], {
        account: d.buyer.account,
        value: PRICE,
      });

      assert.equal(
        await erc1155.read.balanceOf([d.buyer.account.address, 7n]),
        3n,
      );
      assert.equal(
        await erc1155.read.balanceOf([d.seller.account.address, 7n]),
        7n,
      );
    });

    it('rejects a zero quantity and an over-balance listing', async () => {
      const erc1155 = await viem.deployContract('MockERC1155');
      await erc1155.write.mint([d.seller.account.address, 7n, 2n]);
      await erc1155.write.setApprovalForAll([d.marketplace.address, true], {
        account: d.seller.account,
      });

      await rejectsWith(
        d.marketplace.write.list(
          [erc1155.address, 7n, 0n, ZERO, PRICE, await future(3600)],
          { account: d.seller.account },
        ),
        'BadAmount',
      );

      await rejectsWith(
        d.marketplace.write.list(
          [erc1155.address, 7n, 5n, ZERO, PRICE, await future(3600)],
          { account: d.seller.account },
        ),
        'NotTokenOwner',
      );
    });
  });

  describe('pause', () => {
    it('blocks entry paths but never traps funds or assets', async () => {
      const tokenId = await mintApproved(d, d.seller);

      await d.marketplace.write.list(
        [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(3600)],
        { account: d.seller.account },
      );
      const listingId = (await d.marketplace.read.nextListingId()) - 1n;

      await d.marketplace.write.makeOffer(
        [
          d.collection.address,
          tokenId,
          1n,
          ZERO,
          PRICE,
          await future(3600),
        ],
        { account: d.buyer.account, value: PRICE },
      );
      const offerId = (await d.marketplace.read.nextOfferId()) - 1n;

      await d.marketplace.write.pause({ account: d.admin.account });

      // entry paths closed
      await rejectsWith(
        d.marketplace.write.buy([listingId, PRICE, ZERO], {
          account: d.buyer.account,
          value: PRICE,
        }),
        'EnforcedPause',
      );
      await rejectsWith(
        d.marketplace.write.list(
          [d.collection.address, tokenId, 1n, ZERO, PRICE, await future(3600)],
          { account: d.seller.account },
        ),
        'EnforcedPause',
      );

      // exits stay open
      await d.marketplace.write.cancelListing([listingId], {
        account: d.seller.account,
      });
      await d.marketplace.write.cancelOffer([offerId], {
        account: d.buyer.account,
      });
      await d.marketplace.write.withdraw([ZERO], {
        account: d.buyer.account,
      });

      assert.equal(
        await d.marketplace.read.pending([d.buyer.account.address, ZERO]),
        0n,
      );
    });

    it('lets an escrowed auction settle while paused', async () => {
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

      await d.marketplace.write.pause({ account: d.admin.account });
      await networkHelpers.time.increase(1200);

      await d.marketplace.write.settleAuction([auctionId], {
        account: d.other.account,
      });

      assert.equal(
        getAddress(await d.collection.read.ownerOf([tokenId])),
        getAddress(d.buyer.account.address),
      );
    });
  });

  describe('access control', () => {
    it('gates pause, fees and the pay-token allowlist by role', async () => {
      await rejectsWith(
        d.marketplace.write.pause({ account: d.buyer.account }),
        'AccessControlUnauthorizedAccount',
      );
      await rejectsWith(
        d.marketplace.write.setFee([d.buyer.account.address, 100n], {
          account: d.buyer.account,
        }),
        'AccessControlUnauthorizedAccount',
      );
      await rejectsWith(
        d.marketplace.write.setPayToken([d.collection.address, true], {
          account: d.buyer.account,
        }),
        'AccessControlUnauthorizedAccount',
      );
    });

    it('caps the protocol fee', async () => {
      const max = await d.marketplace.read.MAX_FEE_BPS();

      await rejectsWith(
        d.marketplace.write.setFee([d.admin.account.address, max + 1n], {
          account: d.admin.account,
        }),
        'FeeTooHigh',
      );

      await d.marketplace.write.setFee([d.admin.account.address, max], {
        account: d.admin.account,
      });
      assert.equal(await d.marketplace.read.feeBps(), max);
    });

    it('refuses a zero fee recipient and de-listing native currency', async () => {
      await rejectsWith(
        d.marketplace.write.setFee([ZERO, 100n], { account: d.admin.account }),
        'ZeroAddress',
      );
      await rejectsWith(
        d.marketplace.write.setPayToken([ZERO, false], {
          account: d.admin.account,
        }),
        'ZeroAddress',
      );
    });
  });

  // The test that catches money leaks: after a mixed sequence of operations,
  // the contract must hold exactly what it owes and not a wei more or less.
  describe('accounting invariant', () => {
    it('holds exactly the sum of all claimable balances', async () => {
      const accounts = [d.admin, d.seller, d.buyer, d.other];
      const publicClient = await viem.getPublicClient();

      const tokenA = await mintApproved(d, d.seller, 300n);
      const tokenB = await mintApproved(d, d.other, 0n);

      // a completed sale
      await d.marketplace.write.list(
        [d.collection.address, tokenA, 1n, ZERO, PRICE, await future(3600)],
        { account: d.seller.account },
      );
      await d.marketplace.write.buy(
        [(await d.marketplace.read.nextListingId()) - 1n, PRICE, ZERO],
        { account: d.buyer.account, value: PRICE },
      );

      // a live escrowed offer
      await d.marketplace.write.makeOffer(
        [
          d.collection.address,
          tokenB,
          1n,
          ZERO,
          parseEther('0.4'),
          await future(3600),
        ],
        { account: d.buyer.account, value: parseEther('0.4') },
      );

      // a cancelled offer (escrow returned to pending, still held)
      await d.marketplace.write.makeOffer(
        [
          d.collection.address,
          tokenB,
          1n,
          ZERO,
          parseEther('0.2'),
          await future(3600),
        ],
        { account: d.other.account, value: parseEther('0.2') },
      );
      await d.marketplace.write.cancelOffer(
        [(await d.marketplace.read.nextOfferId()) - 1n],
        { account: d.other.account },
      );

      // an auction with an outbid bidder
      await d.marketplace.write.createAuction(
        [d.collection.address, tokenB, 1n, ZERO, PRICE, await future(600)],
        { account: d.other.account },
      );
      const auctionId = (await d.marketplace.read.nextAuctionId()) - 1n;
      await d.marketplace.write.bid([auctionId, PRICE], {
        account: d.buyer.account,
        value: PRICE,
      });
      await d.marketplace.write.bid([auctionId, PRICE * 2n], {
        account: d.seller.account,
        value: PRICE * 2n,
      });

      await networkHelpers.time.increase(1200);
      await d.marketplace.write.settleAuction([auctionId], {
        account: d.admin.account,
      });

      // one party cashes out, to prove withdrawals keep the books straight
      await d.marketplace.write.withdraw([ZERO], {
        account: d.seller.account,
      });

      const held = await publicClient.getBalance({
        address: d.marketplace.address,
      });

      let owed = 0n;
      for (const account of accounts) {
        owed += await d.marketplace.read.pending([
          account.account.address,
          ZERO,
        ]);
      }
      // the live offer's escrow is not in `pending` — it is still the buyer's
      owed += parseEther('0.4');

      assert.equal(
        held,
        owed,
        `marketplace holds ${held} but owes ${owed}`,
      );
    });
  });
});
