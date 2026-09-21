import { chain, marketplaceAddress, factoryAddress } from '@/lib/chain';
import { AddressLink } from '@/components/address-link';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <p>
            Running on {chain.name}. Testnet only — nothing here has value.
          </p>
          <a
            href="https://faucet.polygon.technology/"
            target="_blank"
            rel="noreferrer"
            className="w-fit underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Get test {chain.nativeCurrency.symbol}
          </a>
        </div>

        <dl className="flex flex-col gap-1.5 sm:text-right">
          <div className="flex gap-2 sm:justify-end">
            <dt>Marketplace</dt>
            <dd>
              <AddressLink address={marketplaceAddress} />
            </dd>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <dt>Factory</dt>
            <dd>
              <AddressLink address={factoryAddress} />
            </dd>
          </div>
        </dl>
      </div>
    </footer>
  );
}
