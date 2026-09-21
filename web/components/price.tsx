import { formatEther } from 'viem';
import { chain, NATIVE } from '@/lib/chain';

/** Renders an amount in whichever currency the order is denominated in. */
export function Price({
  amount,
  token,
}: {
  amount: bigint;
  token: `0x${string}`;
}) {
  const symbol = token === NATIVE ? chain.nativeCurrency.symbol : 'ERC-20';
  return (
    <span className="tabular-nums">
      {formatEther(amount)} {symbol}
    </span>
  );
}
