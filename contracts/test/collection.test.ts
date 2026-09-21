import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { getAddress, parseEther } from 'viem';

import { deployAll, rejectsWith, type Deployed } from './helpers.js';

describe('MarketplaceCollection', () => {
  let d: Deployed;

  beforeEach(async () => {
    d = await deployAll();
  });

  it('mints to the caller with metadata', async () => {
    await d.collection.write.mint(['ipfs://one', 0n], {
      account: d.seller.account,
    });

    assert.equal(await d.collection.read.totalMinted(), 1n);
    assert.equal(
      getAddress(await d.collection.read.ownerOf([1n])),
      getAddress(d.seller.account.address),
    );
    assert.equal(await d.collection.read.tokenURI([1n]), 'ipfs://one');
  });

  it('records the minter as royalty receiver', async () => {
    await d.collection.write.mint(['ipfs://one', 500n], {
      account: d.seller.account,
    });

    const [receiver, amount] = await d.collection.read.royaltyInfo([
      1n,
      parseEther('1'),
    ]);

    assert.equal(getAddress(receiver), getAddress(d.seller.account.address));
    assert.equal(amount, parseEther('0.05')); // 5%
  });

  it('reports no royalty when none was set', async () => {
    await d.collection.write.mint(['ipfs://one', 0n], {
      account: d.seller.account,
    });

    const [receiver, amount] = await d.collection.read.royaltyInfo([
      1n,
      parseEther('1'),
    ]);

    assert.equal(receiver, '0x0000000000000000000000000000000000000000');
    assert.equal(amount, 0n);
  });

  it('caps the royalty a minter can set', async () => {
    const max = await d.collection.read.MAX_ROYALTY_BPS();

    await rejectsWith(
      d.collection.write.mint(['ipfs://one', max + 1n], {
        account: d.seller.account,
      }),
      'RoyaltyTooHigh',
    );
  });

  it('rejects an empty metadata URI', async () => {
    await rejectsWith(
      d.collection.write.mint(['', 0n], { account: d.seller.account }),
      'EmptyURI',
    );
  });

  it('advertises ERC-721, ERC-2981 and ERC-4906', async () => {
    const supports = (id: `0x${string}`) =>
      d.collection.read.supportsInterface([id]);

    assert.ok(await supports('0x80ac58cd'), 'ERC-721');
    assert.ok(await supports('0x5b5e139f'), 'ERC-721 Metadata');
    assert.ok(await supports('0x2a55205a'), 'ERC-2981');
    assert.ok(await supports('0x49064906'), 'ERC-4906');
  });
});
