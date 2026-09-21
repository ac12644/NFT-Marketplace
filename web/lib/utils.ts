import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddress(address?: string, width = 4) {
  if (!address) return '';
  return `${address.slice(0, 2 + width)}…${address.slice(-width)}`;
}

/** Resolve an ipfs:// URI through a public gateway for <img> use. */
export function ipfsToHttp(uri?: string) {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) {
    const gateway =
      process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://ipfs.io/ipfs/';
    return gateway + uri.replace('ipfs://', '');
  }
  return uri;
}
