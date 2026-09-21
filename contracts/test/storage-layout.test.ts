import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * An upgradeable contract's storage layout is part of its ABI in every way
 * that matters: reorder or remove a variable and the proxy reads the new
 * code against the old bytes. These checks run against solc's own
 * `storageLayout` output, so they fail at test time rather than after a
 * deploy has already scrambled live state.
 */

type Entry = { slot: string; offset: number; label: string; type: string };
type TypeInfo = {
  label: string;
  numberOfBytes: string;
  members?: Entry[];
};
type Layout = { storage: Entry[]; types: Record<string, TypeInfo> | null };

/* solc tags struct and mapping types with the AST node id of their
   declaration, which changes between compilation units even when the type is
   identical. Strip those so a genuine change still shows up but a recompile
   does not. */
const normaliseType = (type: string) => type.replace(/\)\d+_/g, ')_');

/** Resolve a type to a shape that survives recompilation: its own identifier
 *  plus, for a struct, each member's slot, offset and resolved type. */
function shapeOf(type: string, types: Record<string, TypeInfo> | null): string {
  const info = types?.[type];
  const base = normaliseType(type);

  if (!info?.members) return base;

  const members = info.members
    .map(
      (m) =>
        `${m.label}@${m.slot}+${m.offset}:${shapeOf(m.type, types)}`,
    )
    .join(',');

  return `${base}{${members}}`;
}

function storageLayout(contract: string): Layout {
  const dir = join(import.meta.dirname, '../artifacts/build-info');

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const info = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const contracts = info.output?.contracts;
    if (!contracts) continue;

    for (const source of Object.keys(contracts)) {
      const found = contracts[source][contract];
      if (found?.storageLayout) {
        return {
          storage: found.storageLayout.storage,
          types: found.storageLayout.types ?? null,
        };
      }
    }
  }

  throw new Error(`No storage layout for ${contract}. Run \`pnpm compile\`.`);
}

const describeEntry = (e: Entry, types: Record<string, TypeInfo> | null) =>
  `${e.label}@${e.slot}+${e.offset}:${shapeOf(e.type, types)}`;

/** Throws if `next` is not an append-only continuation of `previous`. */
function assertCompatible(previous: Layout, next: Layout) {
  if (next.storage.length < previous.storage.length) {
    throw new Error('an upgrade must not remove storage variables');
  }

  for (const [index, before] of previous.storage.entries()) {
    const after = next.storage[index];
    const expected = describeEntry(before, previous.types);
    const actual = after ? describeEntry(after, next.types) : 'missing';

    if (actual !== expected) {
      throw new Error(
        `slot ${index} changed between versions:\n  ${expected}\n  ${actual}`,
      );
    }
  }
}

describe('Storage layout', () => {
  it('puts marketplace state at slot 0, so no gap is needed', () => {
    const { storage } = storageLayout('Marketplace');

    // Every OpenZeppelin upgradeable base uses ERC-7201 namespaced storage,
    // so none of them occupy a sequential slot. Marketplace is the most
    // derived contract, so its own state starts at 0 and can only grow by
    // appending — which is exactly why there is no __gap here.
    assert.equal(storage[0]?.slot, '0');
    assert.equal(storage[0]?.label, 'feeRecipient');
  });

  it('keeps every v1 slot identical in v2, structs included', () => {
    assertCompatible(
      storageLayout('Marketplace'),
      storageLayout('MarketplaceV2'),
    );
  });

  // A layout check that cannot fail is worthless, so exercise the failure
  // modes it exists to catch.
  describe('catches incompatible changes', () => {
    const base = (): Layout => ({
      storage: [
        { slot: '0', offset: 0, label: 'a', type: 't_address' },
        { slot: '1', offset: 0, label: 'b', type: 't_uint256' },
      ],
      types: null,
    });

    it('a reordered variable', () => {
      const next = base();
      next.storage = [next.storage[1], next.storage[0]];
      assert.throws(() => assertCompatible(base(), next), /slot 0 changed/);
    });

    it('a removed variable', () => {
      const next = base();
      next.storage = [next.storage[0]];
      assert.throws(() => assertCompatible(base(), next), /must not remove/);
    });

    it('a narrowed type', () => {
      const next = base();
      next.storage[1] = { ...next.storage[1], type: 't_uint128' };
      assert.throws(() => assertCompatible(base(), next), /slot 1 changed/);
    });

    it('a struct that gained a member', () => {
      const previous: Layout = {
        storage: [{ slot: '0', offset: 0, label: 's', type: 't_struct(S)1_storage' }],
        types: {
          't_struct(S)1_storage': {
            label: 'S',
            numberOfBytes: '32',
            members: [{ slot: '0', offset: 0, label: 'x', type: 't_uint256' }],
          },
        },
      };
      const next: Layout = {
        storage: [{ slot: '0', offset: 0, label: 's', type: 't_struct(S)2_storage' }],
        types: {
          't_struct(S)2_storage': {
            label: 'S',
            numberOfBytes: '64',
            members: [
              { slot: '0', offset: 0, label: 'x', type: 't_uint256' },
              { slot: '1', offset: 0, label: 'y', type: 't_uint256' },
            ],
          },
        },
      };
      assert.throws(() => assertCompatible(previous, next), /slot 0 changed/);
    });

    it('but accepts a pure recompile, where only AST ids move', () => {
      const previous: Layout = {
        storage: [{ slot: '0', offset: 0, label: 's', type: 't_struct(S)1_storage' }],
        types: {
          't_struct(S)1_storage': {
            label: 'S',
            numberOfBytes: '32',
            members: [{ slot: '0', offset: 0, label: 'x', type: 't_uint256' }],
          },
        },
      };
      const next: Layout = {
        storage: [{ slot: '0', offset: 0, label: 's', type: 't_struct(S)9999_storage' }],
        types: {
          't_struct(S)9999_storage': {
            label: 'S',
            numberOfBytes: '32',
            members: [{ slot: '0', offset: 0, label: 'x', type: 't_uint256' }],
          },
        },
      };
      assertCompatible(previous, next);
    });
  });

  it('only appends in v2', () => {
    const v1 = storageLayout('Marketplace').storage;
    const v2 = storageLayout('MarketplaceV2').storage;

    const appended = v2.slice(v1.length);
    const highestBefore = Number(v1.at(-1)?.slot ?? -1);

    for (const entry of appended) {
      assert.ok(
        Number(entry.slot) > highestBefore,
        `${entry.label} was inserted at slot ${entry.slot}, at or below the ` +
          `highest v1 slot (${highestBefore}) — it must come after`,
      );
    }
  });
});
