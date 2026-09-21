import { ExternalLinkIcon } from 'lucide-react';

import { explorerAddressUrl } from '@/lib/chain';
import { shortAddress, cn } from '@/lib/utils';

/** An address, always monospaced, always linked to the explorer. */
export function AddressLink({
  address,
  label,
  className,
}: {
  address: string;
  label?: string;
  className?: string;
}) {
  const href = explorerAddressUrl(address);
  const text = label ?? shortAddress(address, 4);

  // A local node has no explorer; show the address rather than a dead link.
  if (!href) {
    return (
      <span className={cn('font-mono text-sm', className)}>{text}</span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group inline-flex items-center gap-1.5 font-mono text-sm transition-colors hover:text-foreground',
        className,
      )}
    >
      {text}
      <ExternalLinkIcon className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
    </a>
  );
}
