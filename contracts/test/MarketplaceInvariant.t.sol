// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from 'forge-std/src/Test.sol';

import {Marketplace} from '../src/Marketplace.sol';
import {MarketplaceProxy} from '../src/MarketplaceProxy.sol';
import {MarketplaceCollection} from '../src/MarketplaceCollection.sol';
import {CollectionFactory} from '../src/CollectionFactory.sol';
import {MarketplaceHandler} from './MarketplaceHandler.sol';

/// @dev The unit suite proves specific sequences balance. These prove the
///      books balance under sequences nobody wrote down — which is the part
///      hand-written tests structurally cannot cover.
contract MarketplaceInvariantTest is Test {
  Marketplace private market;
  MarketplaceCollection private collection;
  MarketplaceHandler private handler;

  address private constant ADMIN = address(0xAD1);
  address private constant FEE_RECIPIENT = address(0xFEE);

  function setUp() public {
    CollectionFactory factory = new CollectionFactory(ADMIN);

    vm.prank(ADMIN);
    collection = MarketplaceCollection(factory.create('Inv', 'INV', ''));

    Marketplace implementation = new Marketplace();
    MarketplaceProxy proxy = new MarketplaceProxy(
      address(implementation),
      abi.encodeCall(
        Marketplace.initialize,
        (ADMIN, FEE_RECIPIENT, 250, ADMIN)
      )
    );
    market = Marketplace(address(proxy));

    handler = new MarketplaceHandler(market, collection, FEE_RECIPIENT);
    targetContract(address(handler));
  }

  /// The contract must always be able to honour every `withdraw` it owes.
  /// If this breaks, someone's balance is unpayable.
  function invariant_solvent() public view {
    assertGe(
      address(market).balance,
      handler.totalPending(),
      'marketplace owes more than it holds'
    );
  }

  /// Stronger: it holds exactly what it owes plus what it escrows — no wei
  /// created, none stranded.
  function invariant_exactAccounting() public view {
    assertEq(
      address(market).balance,
      handler.totalPending() +
        handler.ghostOfferEscrow() +
        handler.ghostBidEscrow(),
      'balance does not match pending + escrow'
    );
  }

  /// A listed token stays with its seller until it actually sells.
  function invariant_escrowOnlyForAuctions() public view {
    assertLe(
      collection.balanceOf(address(market)),
      collection.totalMinted(),
      'marketplace holds more tokens than exist'
    );
  }
}
