import { NextResponse } from 'next/server';

import { checkFile, pinataClient, rateLimited } from '@/lib/server/pinata';
import {
  collectionMetadataSchema,
  pruneEmpty,
} from '@/lib/server/metadata-schema';

export const runtime = 'nodejs';

/**
 * Pins contract-level metadata (ERC-7572) for a collection: the JSON a
 * marketplace reads from `contractURI()` to show a collection's name, blurb,
 * avatar and banner.
 *
 * Both images are optional — a collection can be created with metadata that is
 * just a name, or with none at all.
 */
export async function POST(request: Request) {
  const pinata = pinataClient();
  if (!pinata) {
    return NextResponse.json(
      { error: 'Uploads are not configured on this deployment.' },
      { status: 503 },
    );
  }

  if (rateLimited(request)) {
    return NextResponse.json(
      { error: 'Too many uploads. Try again in a minute.' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected form data.' }, { status: 400 });
  }

  let collaborators: unknown;
  try {
    const raw = form.get('collaborators');
    collaborators =
      typeof raw === 'string' && raw.trim() !== ''
        ? JSON.parse(raw)
        : undefined;
  } catch {
    return NextResponse.json(
      { error: 'Collaborators must be valid JSON.' },
      { status: 400 },
    );
  }

  const parsed = collectionMetadataSchema.safeParse({
    name: form.get('name'),
    description: form.get('description') ?? '',
    external_link: form.get('external_link') ?? '',
    ...(collaborators === undefined ? {} : { collaborators }),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue
          ? `${issue.path.join('.') || 'metadata'}: ${issue.message}`
          : 'Invalid metadata.',
      },
      { status: 400 },
    );
  }

  // `image` is the collection avatar, `banner_image` the header. Either may be
  // omitted; if present they must pass the same checks as token artwork.
  const images: Record<string, string> = {};

  try {
    for (const field of ['image', 'banner_image', 'featured_image'] as const) {
      const value = form.get(field);
      if (value === null || (value instanceof File && value.size === 0)) {
        continue;
      }

      const problem = checkFile(value);
      if (problem) {
        return NextResponse.json(
          { error: `${field}: ${problem.error}` },
          { status: problem.status },
        );
      }

      const pinned = await pinata.upload.public.file(value as File);
      images[field] = `ipfs://${pinned.cid}`;
    }

    const metadata = await pinata.upload.public.json(
      pruneEmpty({ ...parsed.data, ...images }),
    );

    return NextResponse.json({ contractURI: `ipfs://${metadata.cid}` });
  } catch (error) {
    console.error('Pinata upload failed', error);
    return NextResponse.json(
      { error: 'Could not pin to IPFS. Try again.' },
      { status: 502 },
    );
  }
}
