import { NextResponse } from 'next/server';

import {
  checkFile,
  pinataClient,
  rateLimited,
} from '@/lib/server/pinata';
import {
  parseAttributes,
  pruneEmpty,
  tokenMetadataSchema,
} from '@/lib/server/metadata-schema';

export const runtime = 'nodejs';

/** Pins the artwork, then an OpenSea-standard metadata JSON pointing at it. */
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

  const file = form.get('file');
  const fileProblem = checkFile(file);
  if (fileProblem) {
    return NextResponse.json(
      { error: fileProblem.error },
      { status: fileProblem.status },
    );
  }

  let attributes: unknown;
  try {
    attributes = parseAttributes(form.get('attributes'));
  } catch {
    return NextResponse.json(
      { error: 'Traits must be valid JSON.' },
      { status: 400 },
    );
  }

  const parsed = tokenMetadataSchema.safeParse({
    name: form.get('name'),
    description: form.get('description'),
    external_url: form.get('external_url') ?? '',
    background_color: form.get('background_color') ?? '',
    animation_url: form.get('animation_url') ?? '',
    ...(attributes === undefined ? {} : { attributes }),
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

  try {
    const image = await pinata.upload.public.file(file as File);

    const metadata = await pinata.upload.public.json(
      pruneEmpty({
        ...parsed.data,
        image: `ipfs://${image.cid}`,
      }),
    );

    return NextResponse.json({ tokenURI: `ipfs://${metadata.cid}` });
  } catch (error) {
    console.error('Pinata upload failed', error);
    return NextResponse.json(
      { error: 'Could not pin to IPFS. Try again.' },
      { status: 502 },
    );
  }
}
