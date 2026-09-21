import { ipfsToHttp } from '@/lib/utils';

/** One trait, per the OpenSea standard. */
export type Attribute = {
  trait_type?: string;
  value: string | number;
  display_type?: 'number' | 'boost_number' | 'boost_percentage' | 'date';
  max_value?: number;
};

export type NftMetadata = {
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  animation_url?: string;
  background_color?: string;
  attributes?: Attribute[];
};

function isAttribute(value: unknown): value is Attribute {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Attribute;
  return (
    typeof candidate.value === 'string' || typeof candidate.value === 'number'
  );
}

/** Fetch and normalise one token's metadata JSON. Never throws. */
export async function fetchMetadata(tokenURI: string): Promise<NftMetadata> {
  try {
    const response = await fetch(ipfsToHttp(tokenURI));
    if (!response.ok) return {};

    const raw = (await response.json()) as NftMetadata;

    return {
      name: raw.name,
      description: raw.description,
      image: ipfsToHttp(raw.image),
      external_url: raw.external_url,
      animation_url: ipfsToHttp(raw.animation_url),
      background_color: raw.background_color,
      // Third-party collections are not obliged to be well-formed; keep only
      // entries that actually match the standard.
      attributes: Array.isArray(raw.attributes)
        ? raw.attributes.filter(isAttribute)
        : undefined,
    };
  } catch {
    // A dead pin or a gateway timeout should blank one card, not the page.
    return {};
  }
}

/** Collection-level metadata, per ERC-7572. */
export type CollectionMetadata = {
  name?: string;
  description?: string;
  image?: string;
  banner_image?: string;
  featured_image?: string;
  external_link?: string;
  collaborators?: string[];
};

/** Fetch a collection's ERC-7572 metadata. Never throws. */
export async function fetchCollectionMetadata(
  contractURI: string,
): Promise<CollectionMetadata> {
  if (!contractURI) return {};

  try {
    const response = await fetch(ipfsToHttp(contractURI));
    if (!response.ok) return {};

    const raw = (await response.json()) as CollectionMetadata;
    return {
      name: raw.name,
      description: raw.description,
      image: ipfsToHttp(raw.image),
      banner_image: ipfsToHttp(raw.banner_image),
      featured_image: ipfsToHttp(raw.featured_image),
      external_link: raw.external_link,
      collaborators: raw.collaborators,
    };
  } catch {
    return {};
  }
}
