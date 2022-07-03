import supportedChains from './chains';

export function getChainData(chainId) {
  if (!chainId) {
    return null
  }
  const chainData = supportedChains.filter(
    chain => chain.chain_id === chainId
  )[0]

  if (!chainData) {
    throw new Error('ChainId missing or not supported')
  }

  const API_KEY = 'a1f754ea74b24beea097773f476894e0';

  if (
    chainData.rpc_url.includes('infura.io') &&
    chainData.rpc_url.includes('%API_KEY%') &&
    API_KEY
  ) {
    const rpcUrl = chainData.rpc_url.replace('%API_KEY%', API_KEY);

    return {
      ...chainData,
      rpc_url: rpcUrl
    }
  }

  return chainData
}

export function ellipseAddress(address = '', width = 7) {
  if (!address) {
    return ''
  }
  return `${address.slice(0, width)}....${address.slice(-width)}`
}
