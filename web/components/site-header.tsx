'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { ConnectButton } from '@/components/connect-button';
import { ThemeToggle } from '@/components/theme-toggle';

const pages = [
  { title: 'Market', href: '/nfts' },
  { title: 'Create', href: '/create' },
  { title: 'My NFTs', href: '/assets' },
];

/**
 * Two rows on a phone, one from `sm` up. Squeezing the brand, three links and
 * a wallet button onto one narrow row forces a minimum width that the rest of
 * the page then inherits, so the whole document scrolls sideways.
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-16 items-center gap-4">
          <Link
            href="/"
            className="min-w-0 truncate font-semibold tracking-tight transition-colors hover:text-accent"
          >
            Marketplace
          </Link>

          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <NavLinks pathname={pathname} />
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>

        <nav className="-mx-1 flex items-center gap-1 overflow-x-auto pb-2 text-sm sm:hidden">
          <NavLinks pathname={pathname} />
        </nav>
      </div>
    </header>
  );
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {pages.map((page) => {
        const active =
          pathname === page.href || pathname.startsWith(`${page.href}/`);

        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-md px-3 py-2 transition-colors',
              active
                ? 'font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {page.title}
          </Link>
        );
      })}
    </>
  );
}
