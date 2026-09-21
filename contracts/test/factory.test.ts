import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { getAddress, parseEther } from 'viem';

import {
  createCollection,
  deployAll,
  future,
  rejectsWith,
  viem,
  ZERO,
  type Deployed,
} from './helpers.js';

describe('CollectionFactory', () => {
  let d: Deployed;

  beforeEach(async () => {
    d = await deployAll();
  });

  it('creates a collection owned by the caller', async () => {
    const mine = await createCollection(d.factory, d.seller, 'Seller Art', 'SART');

    assert.equal(await mine.read.name(), 'Seller Art');
    assert.equal(await mine.read.symbol(), 'SART');
    assert.ok(
      await mine.read.hasRole([
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        d.seller.account.address,
      ]),
      'creator should hold DEFAULT_ADMIN_ROLE',
    );
    assert.ok(await d.factory.read.isCollection([mine.address]));
  });

  it('gives each collection its own independent state', async () => {
    const a = await createCollection(d.factory, d.seller, 'Alpha', 'A');
    const b = await createCollection(d.factory, d.buyer, 'Beta', 'B');

    assert.notEqual(a.address, b.address);

    await a.write.mint(['ipfs://a', 0n], { account: d.seller.account });
    await a.write.mint(['ipfs://a2', 0n], { account: d.seller.account });
    await b.write.mint(['ipfs://b', 0n], { account: d.buyer.account });

    assert.equal(await a.read.totalMinted(), 2n);
    assert.equal(await b.read.totalMinted(), 1n);

    // token 1 exists in both, owned by different people
    assert.equal(
      getAddress(await a.read.ownerOf([1n])),
      getAddress(d.seller.account.address),
    );
    assert.equal(
      getAddress(await b.read.ownerOf([1n])),
      getAddress(d.buyer.account.address),
    );
    assert.equal(await a.read.name(), 'Alpha');
    assert.equal(await b.read.name(), 'Beta');
  });

  it('deploys a real EIP-1167 minimal proxy, not a full copy', async () => {
    const publicClient = await viem.getPublicClient();
    const mine = await createCollection(d.factory, d.seller, 'Proxy', 'PXY');

    const code = await publicClient.getCode({ address: mine.address });
    const implementation = await d.factory.read.implementation();

    // The canonical minimal-proxy runtime: 45 bytes with the implementation
    // address spliced into the middle.
    const expected =
      '0x363d3d373d3d3d363d73' +
      implementation.slice(2).toLowerCase() +
      '5af43d82803e903d91602b57fd5bf3';

    assert.equal(code?.toLowerCase(), expected);
    assert.equal((code!.length - 2) / 2, 45, 'runtime should be 45 bytes');
  });

  it('clones cheaply', async () => {
    const publicClient = await viem.getPublicClient();

    const hash = await d.factory.write.create(['Clone', 'CLN', ''], {
      account: d.seller.account,
    });
    const { gasUsed } = await publicClient.waitForTransactionReceipt({ hash });

    // A full ERC-721 + URIStorage + Royalty + AccessControl deployment is
    // millions of gas; a clone plus initialize is a small fraction of that.
    assert.ok(gasUsed < 400_000n, `clone used ${gasUsed} gas`);
  });

  it('refuses an empty name or symbol', async () => {
    await rejectsWith(
      d.factory.write.create(['', 'X', ''], { account: d.seller.account }),
      'EmptyName',
    );
    await rejectsWith(
      d.factory.write.create(['X', '', ''], { account: d.seller.account }),
      'EmptySymbol',
    );
  });

  describe('implementation hardening', () => {
    it('cannot be initialized', async () => {
      const impl = await viem.getContractAt(
        'MarketplaceCollection',
        await d.factory.read.implementation(),
      );

      await rejectsWith(
        impl.write.initialize([d.seller.account.address, 'Hijack', 'HJK', ''], {
          account: d.seller.account,
        }),
        'AlreadyInitialized',
      );
    });

    // Regression: the implementation marks itself initialized to block
    // takeover, which previously also satisfied the mint guard and let anyone
    // mint token 0 into it.
    it('cannot be minted into', async () => {
      const impl = await viem.getContractAt(
        'MarketplaceCollection',
        await d.factory.read.implementation(),
      );

      await rejectsWith(
        impl.write.mint(['ipfs://x', 0n], { account: d.seller.account }),
        'NotInitialized',
      );
    });

    it('a live clone cannot be re-initialized', async () => {
      const mine = await createCollection(d.factory, d.seller, 'Mine', 'MINE');

      await rejectsWith(
        mine.write.initialize([d.buyer.account.address, 'Stolen', 'STL', ''], {
          account: d.buyer.account,
        }),
        'AlreadyInitialized',
      );
    });
  });

  it('a user-created collection trades on the marketplace', async () => {
    const mine = await createCollection(d.factory, d.seller, 'Seller Art', 'SART');

    await mine.write.mint(['ipfs://art', 500n], { account: d.seller.account });
    await mine.write.setApprovalForAll([d.marketplace.address, true], {
      account: d.seller.account,
    });

    const price = parseEther('1');
    await d.marketplace.write.list(
      [mine.address, 1n, 1n, ZERO, price, await future(3600)],
      { account: d.seller.account },
    );
    const listingId = (await d.marketplace.read.nextListingId()) - 1n;

    await d.marketplace.write.buy([listingId, price, ZERO], {
      account: d.buyer.account,
      value: price,
    });

    assert.equal(
      getAddress(await mine.read.ownerOf([1n])),
      getAddress(d.buyer.account.address),
    );

    // royalty set at mint on a cloned collection is honoured
    const royalty = (price * 500n) / 10_000n;
    const fee = (price * 250n) / 10_000n;
    assert.equal(
      await d.marketplace.read.pending([d.seller.account.address, ZERO]),
      price - fee, // seller is also the royalty receiver here
    );
    assert.ok(royalty > 0n);
  });
});

describe('CollectionFactory — implementation', () => {
  let d: Deployed;

  beforeEach(async () => {
    d = await deployAll();
  });

  it('is owned, with a two-step handover', async () => {
    assert.equal(
      getAddress(await d.factory.read.owner()),
      getAddress(d.admin.account.address),
    );

    await d.factory.write.transferOwnership([d.seller.account.address], {
      account: d.admin.account,
    });

    // not yet — the handover only completes when the new owner accepts
    assert.equal(
      getAddress(await d.factory.read.owner()),
      getAddress(d.admin.account.address),
    );

    await d.factory.write.acceptOwnership({ account: d.seller.account });
    assert.equal(
      getAddress(await d.factory.read.owner()),
      getAddress(d.seller.account.address),
    );
  });

  it('points new collections at new logic, leaving existing ones frozen', async () => {
    const before = await createCollection(d.factory, d.seller, 'Before', 'B4');
    const oldImplementation = await d.factory.read.implementation();

    // a second, independently deployed implementation
    const next = await viem.deployContract('MarketplaceCollection');
    await d.factory.write.setImplementation([next.address], {
      account: d.admin.account,
    });
    assert.equal(
      getAddress(await d.factory.read.implementation()),
      getAddress(next.address),
    );

    const after = await createCollection(d.factory, d.seller, 'After', 'AF');

    const publicClient = await viem.getPublicClient();
    const runtimeOf = async (address: `0x${string}`) =>
      (await publicClient.getCode({ address }))!.toLowerCase();

    // The implementation is baked into each proxy's runtime bytecode, so the
    // pre-existing collection still delegates to the old logic.
    assert.ok(
      (await runtimeOf(before.address)).includes(
        oldImplementation.slice(2).toLowerCase(),
      ),
      'existing collection should still point at the old implementation',
    );
    assert.ok(
      (await runtimeOf(after.address)).includes(
        next.address.slice(2).toLowerCase(),
      ),
      'new collection should point at the new implementation',
    );

    // and the old one still works
    await before.write.mint(['ipfs://still-fine', 0n], {
      account: d.seller.account,
    });
    assert.equal(await before.read.totalMinted(), 1n);
  });

  it('records which implementation each collection was built from', async () => {
    const publicClient = await viem.getPublicClient();
    const implementation = await d.factory.read.implementation();

    const hash = await d.factory.write.create(['Traceable', 'TRC', ''], {
      account: d.seller.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const [event] = await publicClient.getContractEvents({
      address: d.factory.address,
      abi: d.factory.abi,
      eventName: 'CollectionCreated',
      blockHash: receipt.blockHash,
    });

    assert.equal(
      getAddress(event.args.implementation as `0x${string}`),
      getAddress(implementation),
    );
  });

  it('lets only the owner change it', async () => {
    const next = await viem.deployContract('MarketplaceCollection');

    await rejectsWith(
      d.factory.write.setImplementation([next.address], {
        account: d.seller.account,
      }),
      'OwnableUnauthorizedAccount',
    );
  });

  describe('rejects implementations that would break clones', () => {
    it('an address with no code', async () => {
      await rejectsWith(
        d.factory.write.setImplementation([d.seller.account.address], {
          account: d.admin.account,
        }),
        'NotAContract',
      );
    });

    it('a contract that is not an ERC-721', async () => {
      const erc20 = await viem.deployContract('MockERC20');
      await rejectsWith(
        d.factory.write.setImplementation([erc20.address], {
          account: d.admin.account,
        }),
        'NotACollection',
      );

      const erc1155 = await viem.deployContract('MockERC1155');
      await rejectsWith(
        d.factory.write.setImplementation([erc1155.address], {
          account: d.admin.account,
        }),
        'NotACollection',
      );
    });

    it('an ERC-721 with no initialized() to check', async () => {
      const bad = await viem.deployContract('MaliciousRoyalty', [
        0,
        d.admin.account.address,
      ]);
      await rejectsWith(
        d.factory.write.setImplementation([bad.address], {
          account: d.admin.account,
        }),
        'NotACollection',
      );
    });

    // An unlocked implementation could be claimed by whoever calls initialize
    // on it first, polluting the template every future clone is made from.
    it('an implementation that is still unlocked', async () => {
      const unlocked = await viem.deployContract('FakeCollection', [false]);
      await rejectsWith(
        d.factory.write.setImplementation([unlocked.address], {
          account: d.admin.account,
        }),
        'ImplementationNotLocked',
      );

      // the same double, locked, is accepted
      const locked = await viem.deployContract('FakeCollection', [true]);
      await d.factory.write.setImplementation([locked.address], {
        account: d.admin.account,
      });
      assert.equal(
        getAddress(await d.factory.read.implementation()),
        getAddress(locked.address),
      );
    });
  });
});

describe('MarketplaceCollection — ERC-7572 contract metadata', () => {
  let d: Deployed;

  beforeEach(async () => {
    d = await deployAll();
  });

  it('stores collection metadata given at creation', async () => {
    const mine = await createCollection(
      d.factory,
      d.seller,
      'Branded',
      'BRND',
      'ipfs://collection-meta',
    );

    assert.equal(await mine.read.contractURI(), 'ipfs://collection-meta');
  });

  it('defaults to empty and can be set later by the owner', async () => {
    const mine = await createCollection(d.factory, d.seller, 'Plain', 'PLN');
    assert.equal(await mine.read.contractURI(), '');

    await mine.write.setContractURI(['ipfs://added-later'], {
      account: d.seller.account,
    });
    assert.equal(await mine.read.contractURI(), 'ipfs://added-later');
  });

  it('emits ContractURIUpdated so marketplaces refetch', async () => {
    const publicClient = await viem.getPublicClient();
    const mine = await createCollection(d.factory, d.seller, 'Plain', 'PLN');

    const hash = await mine.write.setContractURI(['ipfs://x'], {
      account: d.seller.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const events = await publicClient.getContractEvents({
      address: mine.address,
      abi: mine.abi,
      eventName: 'ContractURIUpdated',
      blockHash: receipt.blockHash,
    });
    assert.equal(events.length, 1);
  });

  it('lets only the collection owner change it', async () => {
    const mine = await createCollection(d.factory, d.seller, 'Plain', 'PLN');

    await rejectsWith(
      mine.write.setContractURI(['ipfs://hijack'], {
        account: d.buyer.account,
      }),
      'AccessControlUnauthorizedAccount',
    );
  });

  // ERC-4906, which ERC721URIStorage implements: marketplaces watch it to
  // refresh a single token's metadata.
  it('emits MetadataUpdate when a token is minted', async () => {
    const publicClient = await viem.getPublicClient();
    const mine = await createCollection(d.factory, d.seller, 'Plain', 'PLN');

    const hash = await mine.write.mint(['ipfs://token', 0n], {
      account: d.seller.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const events = await publicClient.getContractEvents({
      address: mine.address,
      abi: mine.abi,
      eventName: 'MetadataUpdate',
      blockHash: receipt.blockHash,
    });
    assert.equal(events.length, 1);
  });
});
