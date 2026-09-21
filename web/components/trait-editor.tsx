'use client';

import { useState } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';

import type { Attribute } from '@/lib/metadata';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Row = {
  trait_type: string;
  value: string;
  display_type: '' | NonNullable<Attribute['display_type']>;
};

const DISPLAY_TYPES = [
  { value: '', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boost_number', label: 'Boost (+N)' },
  { value: 'boost_percentage', label: 'Boost (+N%)' },
  { value: 'date', label: 'Date' },
] as const;

const empty: Row = { trait_type: '', value: '', display_type: '' };

/**
 * Builds the `attributes` array for the token metadata. Emits it as a hidden
 * JSON field so the form still posts as plain multipart data.
 *
 * Numeric display types must carry unquoted numbers — the standard is explicit
 * about that — so those rows are converted here and rejected by the server if
 * they are not parseable.
 */
export function TraitEditor() {
  const [rows, setRows] = useState<Row[]>([]);

  const attributes: Attribute[] = rows
    .filter((row) => row.value.trim() !== '')
    .map((row) => {
      const base: Attribute =
        row.display_type === ''
          ? { value: row.value.trim() }
          : { value: Number(row.value), display_type: row.display_type };

      return row.trait_type.trim()
        ? { trait_type: row.trait_type.trim(), ...base }
        : base;
    })
    .filter(
      (attribute) =>
        typeof attribute.value === 'string' ||
        Number.isFinite(attribute.value),
    );

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Traits</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRows((current) => [...current, empty])}
        >
          <PlusIcon />
          Add trait
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Optional. Traits show on the item page and let buyers filter a
          collection.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const numeric = row.display_type !== '';
            const invalid =
              numeric &&
              row.value.trim() !== '' &&
              !Number.isFinite(Number(row.value));

            return (
              <li key={index} className="flex gap-2">
                <Input
                  value={row.trait_type}
                  onChange={(event) =>
                    update(index, { trait_type: event.target.value })
                  }
                  placeholder="Trait"
                  aria-label={`Trait ${index + 1} name`}
                  maxLength={64}
                />
                <Input
                  value={row.value}
                  onChange={(event) =>
                    update(index, { value: event.target.value })
                  }
                  placeholder={numeric ? 'Number' : 'Value'}
                  inputMode={numeric ? 'decimal' : 'text'}
                  aria-label={`Trait ${index + 1} value`}
                  aria-invalid={invalid}
                  maxLength={128}
                />
                <select
                  value={row.display_type}
                  onChange={(event) =>
                    update(index, {
                      display_type: event.target.value as Row['display_type'],
                    })
                  }
                  aria-label={`Trait ${index + 1} display type`}
                  className="h-10 shrink-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {DISPLAY_TYPES.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setRows((current) => current.filter((_, i) => i !== index))
                  }
                  aria-label={`Remove trait ${index + 1}`}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <input
        type="hidden"
        name="attributes"
        value={attributes.length > 0 ? JSON.stringify(attributes) : ''}
      />
    </div>
  );
}
