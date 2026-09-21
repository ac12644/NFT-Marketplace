import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { encodeFunctionData, parseAbi } from 'viem';

const UPGRADE_DELAY = 2 * 24 * 60 * 60; // 48 hours
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/// Deploys:
///   - CollectionFactory (which deploys the collection implementation itself)
///   - MarketplaceTimelock, which will hold UPGRADER_ROLE
///   - the Marketplace implementation
///   - an ERC-1967 proxy, initialised in the same transaction
///
/// `NEXT_PUBLIC_MARKETPLACE_ADDRESS` is the **proxy** address, not the
/// implementation — all state lives in the proxy.
export default buildModule('MarketplaceModule', (m) => {
  const admin = m.getParameter('admin', m.getAccount(0));
  const feeRecipient = m.getParameter('feeRecipient', m.getAccount(0));
  const feeBps = m.getParameter('feeBps', 250); // 2.5%
  const minDelay = m.getParameter('minDelay', UPGRADE_DELAY);

  const factory = m.contract('CollectionFactory', [admin]);

  /* Timelock roles, hardened:
     - proposers: who can schedule an upgrade. Override with a multisig.
     - executors: address(0) means anyone may execute once the delay is up,
       so a single key cannot sit on an approved upgrade.
     - admin: address(0) on purpose. TimelockController grants DEFAULT_ADMIN
       to itself; handing it to an EOA as well would let that key add
       proposers or shorten the delay unilaterally, which would make the
       whole timelock decorative. Role changes must now go through the
       timelock and wait out the same delay. */
  const proposers = m.getParameter('proposers', [admin]);
  const executors = m.getParameter('executors', [ZERO_ADDRESS]);

  const timelock = m.contract('MarketplaceTimelock', [
    minDelay,
    proposers,
    executors,
    ZERO_ADDRESS,
  ]);

  const implementation = m.contract('Marketplace', [], { id: 'Implementation' });

  const initData = encodeFunctionData({
    abi: parseAbi([
      'function initialize(address admin, address feeRecipient, uint96 feeBps, address upgrader)',
    ]),
    functionName: 'initialize',
    args: [
      admin as unknown as `0x${string}`,
      feeRecipient as unknown as `0x${string}`,
      feeBps as unknown as bigint,
      timelock as unknown as `0x${string}`,
    ],
  });

  const proxy = m.contract('MarketplaceProxy', [implementation, initData]);

  // Everything downstream should talk to the proxy at this address.
  const marketplace = m.contractAt('Marketplace', proxy, {
    id: 'MarketplaceProxied',
  });

  return { factory, timelock, implementation, proxy, marketplace };
});
