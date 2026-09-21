import { z } from 'zod';

/* Mirrors the OpenSea metadata standard exactly.
   https://docs.opensea.io/docs/media-and-traits */

const NUMERIC_DISPLAY = [
  'number',
  'boost_number',
  'boost_percentage',
  'date',
] as const;

export const attributeSchema = z
  .object({
    trait_type: z.string().trim().min(1).max(64).optional(),
    value: z.union([z.string().trim().min(1).max(128), z.number()]),
    display_type: z.enum(NUMERIC_DISPLAY).optional(),
    max_value: z.number().optional(),
  })
  .refine((a) => typeof a.value !== 'number' || Number.isFinite(a.value), {
    message: 'Numeric trait values must be finite.',
  })
  // The standard is explicit that numeric values must be unquoted numbers.
  .refine((a) => a.display_type === undefined || typeof a.value === 'number', {
    message:
      'A trait with a display_type must have an unquoted number as its value.',
  })
  .refine((a) => a.max_value === undefined || a.display_type === 'number', {
    message: 'max_value is only meaningful with display_type "number".',
  })
  .refine(
    (a) =>
      a.max_value === undefined ||
      (typeof a.value === 'number' && a.value <= a.max_value),
    { message: 'A trait value cannot exceed its max_value.' },
  );

export type Attribute = z.infer<typeof attributeSchema>;

/** Token-level metadata. */
export const tokenMetadataSchema = z.object({
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().min(1).max(1000),
  external_url: z.union([z.string().trim().url(), z.literal('')]).optional(),
  // Six hexadecimal characters, no leading '#'.
  background_color: z
    .union([z.string().trim().regex(/^[0-9a-fA-F]{6}$/), z.literal('')])
    .optional(),
  animation_url: z.union([z.string().trim().url(), z.literal('')]).optional(),
  attributes: z.array(attributeSchema).max(50).optional(),
});

/** Contract-level metadata (ERC-7572). */
export const collectionMetadataSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(1000).optional(),
  external_link: z.union([z.string().trim().url(), z.literal('')]).optional(),
  collaborators: z
    .array(z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/))
    .max(20)
    .optional(),
});

/** Drop empty strings so absent fields are omitted rather than sent blank. */
export function pruneEmpty<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) =>
        value !== undefined &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );
}

/** Parse the `attributes` form field, which arrives as a JSON string. */
export function parseAttributes(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  return JSON.parse(raw) as unknown;
}
