import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { encodeFunctionData, getAddress, parseEther, zeroHash } from 'viem';

import {
  deployAll,
  future,
  mintApproved,
  networkHelpers,
  rejectsWith,
  split,
  viem,
  ZERO,
  UPGRADE_DELAY,
  type Deployed,
} from './helpers.js';

const PRICE = parseEther('1');

describe('Marketplace — upgradeability', () => {
  let d: Deployed;

  beforeEach(async () => {
    d = await deployAll();
  });

  describe('implementation hardening', () => {
    // Without _disableInitializers, anyone can initialize the implementation
    // and then call upgradeToAndCall on it directly — the classic way a UUPS
    // implementation gets hijacked or bricked.
    it('the implementation cannot be initialized', async () => {
      await rejectsWith(
        d.implementation.write.initialize(
          [
            d.buyer.account.address,
            d.buyer.account.address,
            0n,
            d.buyer.account.address,
          ],
          { account: d.buyer.account },
        ),
        'InvalidInitialization',
      );
    });

    it('the proxy cannot be re-initialized', async () => {
      await rejectsWith(
        d.marketplace.write.initialize(
          [
            d.buyer.account.address,
            d.buyer.account.address,
            0n,
            d.buyer.account.address,
          ],
          { account: d.buyer.account },
        ),
        'InvalidInitialization',
      );
    });

    it('upgradeToAndCall cannot be called on the implementation directly', async () => {
      const next = await viem.deployContract('MarketplaceV2');

      await rejectsWith(
        d.implementation.write.upgradeToAndCall([next.address, '0x'], {
          account: d.admin.account,
        }),
        'UUPSUnauthorizedCallContext',
      );
    });
  });

  describe('authorization', () => {
    it('refuses an upgrade from someone without UPGRADER_ROLE', async () => {
      const next = await viem.deployContract('MarketplaceV2');

      await rejectsWith(
        d.marketplace.write.upgradeToAndCall([next.address, '0x'], {
          account: d.buyer.account,
        }),
        'AccessControlUnauthorizedAccount',
      );
    });

    it('refuses an upgrade from the admin — only the timelock holds it', async () => {
      const next = await viem.deployContract('MarketplaceV2');

      await rejectsWith(
        d.marketplace.write.upgradeToAndCall([next.address, '0x'], {
          account: d.admin.account,
        }),
        'AccessControlUnauthorizedAccount',
      );
    });

    // Regression: DEFAULT_ADMIN_ROLE administers every role in OZ
    // AccessControl by default, so without _setRoleAdmin the admin could grant
    // itself UPGRADER_ROLE and upgrade instantly, making the timelock
    // decorative.
    it('the admin cannot grant itself UPGRADER_ROLE', async () => {
      const role = await d.marketplace.read.UPGRADER_ROLE();

      await rejectsWith(
        d.marketplace.write.grantRole([role, d.admin.account.address], {
          account: d.admin.account,
        }),
        'AccessControlUnauthorizedAccount',
      );

      assert.equal(
        await d.marketplace.read.getRoleAdmin([role]),
        role,
        'UPGRADER_ROLE should administer itself',
      );
    });
  });

  describe('through the timelock', () => {
    function upgradeCall(implementation: `0x${string}`) {
      return encodeFunctionData({
        abi: d.marketplace.abi,
        functionName: 'upgradeToAndCall',
        args: [implementation, '0x'],
      });
    }

    it('enforces the delay, then upgrades', async () => {
      const next = await viem.deployContract('MarketplaceV2');
      const data = upgradeCall(next.address);

      await d.timelock.write.schedule(
        [d.marketplace.address, 0n, data, zeroHash, zeroHash, UPGRADE_DELAY],
        { account: d.admin.account },
      );

      // too early
      await rejectsWith(
        d.timelock.write.execute(
          [d.marketplace.address, 0n, data, zeroHash, zeroHash],
          { account: d.admin.account },
        ),
        'TimelockUnexpectedOperationState',
      );

      await networkHelpers.time.increase(Number(UPGRADE_DELAY) + 1);

      await d.timelock.write.execute(
        [d.marketplace.address, 0n, data, zeroHash, zeroHash],
        { account: d.admin.account },
      );

      const upgraded = await viem.getContractAt(
        'MarketplaceV2',
        d.marketplace.address,
      );
      assert.equal(await upgraded.read.version(), 2n);
    });

    it('preserves live listings and balances across the upgrade', async () => {
      // set up real state: a completed sale and an open listing
      const soldToken = await mintApproved(d, d.seller);
      await d.marketplace.write.list(
        [d.collection.address, soldToken, 1n, ZERO, PRICE, await future(3600)],
        { account: d.seller.account },
      );
      await d.marketplace.write.buy(
        [(await d.marketplace.read.nextListingId()) - 1n, PRICE, ZERO],
        { account: d.buyer.account, value: PRICE },
      );

      // Expiry must outlast the timelock delay, or the listing legitimately
      // expires while the upgrade is waiting — worth knowing operationally:
      // a 48h upgrade window outlives any listing shorter than it.
      const openToken = await mintApproved(d, d.seller);
      await d.marketplace.write.list(
        [
          d.collection.address,
          openToken,
          1n,
          ZERO,
          PRICE,
          await future(30 * 24 * 3600),
        ],
        { account: d.seller.account },
      );
      const openListingId = (await d.marketplace.read.nextListingId()) - 1n;

      const owedBefore = await d.marketplace.read.pending([
        d.seller.account.address,
        ZERO,
      ]);
      const feeBpsBefore = await d.marketplace.read.feeBps();
      assert.ok(owedBefore > 0n);

      // upgrade
      const next = await viem.deployContract('MarketplaceV2');
      const data = upgradeCall(next.address);
      await d.timelock.write.schedule(
        [d.marketplace.address, 0n, data, zeroHash, zeroHash, UPGRADE_DELAY],
        { account: d.admin.account },
      );
      await networkHelpers.time.increase(Number(UPGRADE_DELAY) + 1);
      await d.timelock.write.execute(
        [d.marketplace.address, 0n, data, zeroHash, zeroHash],
        { account: d.admin.account },
      );

      // everything is exactly where it was
      assert.equal(
        await d.marketplace.read.pending([d.seller.account.address, ZERO]),
        owedBefore,
      );
      assert.equal(await d.marketplace.read.feeBps(), feeBpsBefore);

      const listing = await d.marketplace.read.listings([openListingId]);
      assert.equal(getAddress(listing[0]), getAddress(d.seller.account.address));
      assert.equal(listing[2], PRICE);
      assert.equal(listing[4], true);

      // and the contract still works: the open listing is still buyable
      await d.marketplace.write.buy([openListingId, PRICE, ZERO], {
        account: d.other.account,
        value: PRICE,
      });
      assert.equal(
        getAddress(await d.collection.read.ownerOf([openToken])),
        getAddress(d.other.account.address),
      );

      const { seller } = split(PRICE);
      assert.equal(
        await d.marketplace.read.pending([d.seller.account.address, ZERO]),
        owedBefore + seller,
      );

      // withdrawals still pay out after the upgrade
      await d.marketplace.write.withdraw([ZERO], {
        account: d.seller.account,
      });
      assert.equal(
        await d.marketplace.read.pending([d.seller.account.address, ZERO]),
        0n,
      );
    });

    it('keeps escrowed auction assets through an upgrade', async () => {
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

      const next = await viem.deployContract('MarketplaceV2');
      const data = upgradeCall(next.address);
      await d.timelock.write.schedule(
        [d.marketplace.address, 0n, data, zeroHash, zeroHash, UPGRADE_DELAY],
        { account: d.admin.account },
      );
      await networkHelpers.time.increase(Number(UPGRADE_DELAY) + 1);
      await d.timelock.write.execute(
        [d.marketplace.address, 0n, data, zeroHash, zeroHash],
        { account: d.admin.account },
      );

      // the proxy still holds the NFT, and settlement still works
      assert.equal(
        getAddress(await d.collection.read.ownerOf([tokenId])),
        getAddress(d.marketplace.address),
      );

      await d.marketplace.write.settleAuction([auctionId], {
        account: d.other.account,
      });
      assert.equal(
        getAddress(await d.collection.read.ownerOf([tokenId])),
        getAddress(d.buyer.account.address),
      );
    });
  });
});

describe('Marketplace — timelock hardening', () => {
  let d: Deployed;

  const DEFAULT_ADMIN_ROLE =
    '0x0000000000000000000000000000000000000000000000000000000000000000';

  beforeEach(async () => {
    d = await deployAll();
  });

  // A timelock whose admin role sits on an EOA is decorative: that key can add
  // proposers or shorten minDelay and push an upgrade through immediately.
  it('nobody but the timelock itself holds its admin role', async () => {
    assert.equal(
      await d.timelock.read.hasRole([
        DEFAULT_ADMIN_ROLE,
        d.admin.account.address,
      ]),
      false,
      'the deployer must not keep admin on the timelock',
    );

    assert.equal(
      await d.timelock.read.hasRole([DEFAULT_ADMIN_ROLE, d.timelock.address]),
      true,
      'the timelock governs itself',
    );
  });

  it('the admin cannot add a proposer or shorten the delay directly', async () => {
    const proposerRole = await d.timelock.read.PROPOSER_ROLE();

    await rejectsWith(
      d.timelock.write.grantRole([proposerRole, d.buyer.account.address], {
        account: d.admin.account,
      }),
      'AccessControlUnauthorizedAccount',
    );

    // updateDelay is onlyRole(address(this)) — it must come from the timelock
    await rejectsWith(
      d.timelock.write.updateDelay([1n], { account: d.admin.account }),
      'TimelockUnauthorizedCaller',
    );
  });

  it('anyone can execute once the delay is up, so no single key can sit on it', async () => {
    const next = await viem.deployContract('MarketplaceV2');
    const data = encodeFunctionData({
      abi: d.marketplace.abi,
      functionName: 'upgradeToAndCall',
      args: [next.address, '0x'],
    });

    await d.timelock.write.schedule(
      [d.marketplace.address, 0n, data, zeroHash, zeroHash, UPGRADE_DELAY],
      { account: d.admin.account },
    );
    await networkHelpers.time.increase(Number(UPGRADE_DELAY) + 1);

    // executed by an account that is neither admin nor proposer
    await d.timelock.write.execute(
      [d.marketplace.address, 0n, data, zeroHash, zeroHash],
      { account: d.other.account },
    );

    const upgraded = await viem.getContractAt(
      'MarketplaceV2',
      d.marketplace.address,
    );
    assert.equal(await upgraded.read.version(), 2n);
  });
});
