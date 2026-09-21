import { formatEther } from 'viem';
import { chain, NATIVE } from '@/lib/chain';
import { cn } from '@/lib/utils';

/** A headline figure. Numerals are tabular so columns of them line up. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="tnum text-xl font-medium">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function PriceStat({
  label,
  amount,
  token = NATIVE,
}: {
  label: string;
  amount?: bigint;
  token?: `0x${string}`;
}) {
  return (
    <Stat
      label={label}
      value={
        amount === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {formatEther(amount)}
            <span className="ml-1.5 text-sm text-muted-foreground">
              {token === NATIVE ? chain.nativeCurrency.symbol : 'ERC-20'}
            </span>
          </>
        )
      }
    />
  );
}
