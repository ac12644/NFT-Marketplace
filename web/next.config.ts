import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // NFT media is user-supplied and lives on IPFS gateways.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
