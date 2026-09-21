import { PinataSDK } from 'pinata';

/** Server-only. `PINATA_JWT` is never exposed to the browser. */
export function pinataClient() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;

  return new PinataSDK({
    pinataJwt: jwt,
    pinataGateway: process.env.PINATA_GATEWAY,
  });
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// SVG is deliberately absent: it executes script when served from a gateway.
export const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

export type FileProblem = { error: string; status: number };

export function checkFile(value: FormDataEntryValue | null): FileProblem | null {
  if (!(value instanceof File)) {
    return { error: 'No file provided.', status: 400 };
  }
  if (value.size === 0 || value.size > MAX_FILE_BYTES) {
    return { error: 'File must be between 1 byte and 10 MB.', status: 413 };
  }
  if (!ALLOWED_TYPES.includes(value.type)) {
    return {
      error: `Unsupported file type: ${value.type || 'unknown'}.`,
      status: 415,
    };
  }
  return null;
}

/* Per-instance, per-IP throttle. On serverless each instance keeps its own
   window, so this slows abuse rather than stopping it.
   ponytail: in-memory counter. Move to Vercel KV / Upstash if this endpoint
   ever gets found. */
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT;
}
