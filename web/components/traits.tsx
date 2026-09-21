'use client';

import type { Attribute } from '@/lib/metadata';

function formatValue(attribute: Attribute) {
  const { value, display_type: display, max_value: max } = attribute;

  if (display === 'date' && typeof value === 'number') {
    return new Date(value * 1000).toLocaleDateString();
  }
  if (display === 'boost_percentage' && typeof value === 'number') {
    return `+${value}%`;
  }
  if (display === 'boost_number' && typeof value === 'number') {
    return `+${value}`;
  }
  if (display === 'number' && typeof value === 'number' && max !== undefined) {
    return `${value} of ${max}`;
  }
  return String(value);
}

/** Traits as OpenSea renders them: label above, value below. */
export function Traits({ attributes }: { attributes?: Attribute[] }) {
  if (!attributes?.length) return null;

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {attributes.map((attribute, i) => (
        <li
          key={`${attribute.trait_type ?? 'trait'}-${i}`}
          className="rounded-md border bg-surface-sunken px-3 py-2.5"
        >
          {attribute.trait_type && (
            <p className="truncate text-xs text-muted-foreground">
              {attribute.trait_type}
            </p>
          )}
          <p className="truncate font-mono text-sm font-medium">
            {formatValue(attribute)}
          </p>
        </li>
      ))}
    </ul>
  );
}
