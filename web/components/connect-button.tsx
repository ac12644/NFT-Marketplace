'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from 'wagmi';
import { CopyIcon, LogOutIcon, WalletIcon, ImagesIcon } from 'lucide-react';
import { formatUnits } from 'viem';
import { toast } from 'sonner';

import { chain } from '@/lib/chain';
import { shortAddress } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  if (!isConnected) return <ConnectDialog />;
  if (chainId !== chain.id) return <SwitchChainButton />;
  return <AccountMenu address={address!} />;
}

function ConnectDialog() {
  const [open, setOpen] = useState(false);
  const connectors = useConnectors();
  const { connect, isPending } = useConnect();

  // EIP-6963 can surface the same wallet twice; keep the first of each name.
  const unique = connectors.filter(
    (c, i, all) => all.findIndex((o) => o.name === c.name) === i,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent">
          <WalletIcon />
          <span className="hidden sm:inline">Connect Wallet</span>
          <span className="sm:hidden">Connect</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a wallet</DialogTitle>
          <DialogDescription>
            You&apos;ll need test POL on {chain.name} to mint or buy.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {unique.map((connector) => (
            <button
              key={connector.uid}
              disabled={isPending}
              onClick={() =>
                connect(
                  { connector },
                  {
                    onSuccess: () => setOpen(false),
                    onError: (error) => toast.error(error.message),
                  },
                )
              }
              className="flex items-center gap-3 rounded-lg border p-3 text-left text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {connector.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={connector.icon}
                  alt=""
                  className="size-7 rounded-md"
                />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-md bg-muted">
                  <WalletIcon className="size-4" />
                </span>
              )}
              {connector.name}
            </button>
          ))}

          {unique.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No wallets detected. Install a browser wallet, or set
              NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to connect by QR.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SwitchChainButton() {
  const { switchChain, isPending } = useSwitchChain();

  return (
    <Button
      variant="destructive"
      disabled={isPending}
      onClick={() =>
        switchChain(
          { chainId: chain.id },
          { onError: (error) => toast.error(error.message) },
        )
      }
    >
      Switch to {chain.name}
    </Button>
  );
}

function AccountMenu({ address }: { address: `0x${string}` }) {
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <span className="size-2 rounded-full bg-accent" />
          {shortAddress(address)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {balance
            ? `${Number(formatUnits(balance.value, balance.decimals)).toFixed(4)} ${balance.symbol}`
            : 'Connected'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/assets">
            <ImagesIcon />
            My NFTs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(address);
            toast.success('Address copied');
          }}
        >
          <CopyIcon />
          Copy address
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => disconnect()}>
          <LogOutIcon />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
