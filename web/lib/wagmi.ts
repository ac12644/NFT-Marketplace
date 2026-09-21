import { createConfig, http, cookieStorage, createStorage } from 'wagmi';
import { coinbaseWallet, walletConnect } from 'wagmi/connectors';

import { polygonAmoy, hardhat } from 'wagmi/chains';

import { chain } from '@/lib/chain';

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const config = createConfig({
  chains: [chain],
  // Browser-extension wallets arrive on their own via EIP-6963 discovery,
  // which createConfig enables by default — no `injected()` entry needed.
  connectors: [
    coinbaseWallet({ appName: 'NFT Marketplace', preference: 'all' }),
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId })]
      : []),
  ],
  // Both are declared so the transport map satisfies the chain union; only
  // the configured chain is actually offered to the wallet.
  transports: {
    [polygonAmoy.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
    [hardhat.id]: http(
      process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545',
    ),
  },
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
