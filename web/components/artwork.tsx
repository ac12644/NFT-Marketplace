'use client';

import { cn } from '@/lib/utils';

/**
 * Frames an NFT's media. The checkerboard shows through transparent artwork
 * rather than inventing a background colour for it, and `background_color`
 * from the metadata wins when the creator set one.
 */
export function Artwork({
  src,
  alt,
  backgroundColor,
  className,
  priority = false,
}: {
  src?: string;
  alt: string;
  backgroundColor?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden',
        !backgroundColor && 'artwork-backdrop',
        className,
      )}
      style={
        backgroundColor ? { backgroundColor: `#${backgroundColor}` } : undefined
      }
    >
      {src ? (
        // Arbitrary IPFS gateways; next/image optimisation buys little here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="size-full object-contain"
          loading={priority ? 'eager' : 'lazy'}
        />
      ) : (
        <div className="grid size-full place-items-center p-6 text-center text-sm text-muted-foreground">
          Media unavailable
        </div>
      )}
    </div>
  );
}
