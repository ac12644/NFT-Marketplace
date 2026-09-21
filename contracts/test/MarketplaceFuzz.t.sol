// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from 'forge-std/src/Test.sol';

import {Marketplace} from '../src/Marketplace.sol';
import {MarketplaceProxy} from '../src/MarketplaceProxy.sol';
import {MarketplaceCollection} from '../src/MarketplaceCollection.sol';
import {CollectionFactory} from '../src/CollectionFactory.sol';

contract MarketplaceFuzzTest is Test {
  Marketplace private market;
  MarketplaceCollection private collection;

  address private constant ADMIN = address(0xAD1);
  address private constant FEE_RECIPIENT = address(0xFEE);
  address private constant SELLER = address(0x5E11E2);
  address private constant BUYER = address(0xB0B);

  function setUp() public {
    CollectionFactory factory = new CollectionFactory(ADMIN);
    vm.prank(ADMIN);
    collection = MarketplaceCollection(factory.create('Fuzz', 'FZZ', ''));

    Marketplace implementation = new Marketplace();
    MarketplaceProxy proxy = new MarketplaceProxy(
      address(implementation),
      abi.encodeCall(
        Marketplace.initialize,
        (ADMIN, FEE_RECIPIENT, 250, ADMIN)
      )
    );
    market = Marketplace(address(proxy));

    vm.deal(BUYER, 1_000_000 ether);
  }

  function _listAndBuy(
    uint96 price,
    uint96 royaltyBps
  ) private returns (uint256 tokenId) {
    vm.startPrank(SELLER);
    tokenId = collection.mint('ipfs://x', royaltyBps);
    collection.setApprovalForAll(address(market), true);
    uint256 id = market.list(
      address(collection),
      tokenId,
      1,
      address(0),
      price,
      uint64(block.timestamp + 1 days)
    );
    vm.stopPrank();

    vm.prank(BUYER);
    market.buy{value: price}(id, price, address(0));
  }

  /// Whatever the price, fee and royalty, the sale must distribute the price
  /// exactly — not a wei minted, not a wei lost.
  function testFuzz_saleConservesValue(
    uint96 price,
    uint96 feeBps,
    uint96 royaltyBps
  ) public {
    price = uint96(bound(price, 1, 1_000 ether));
    feeBps = uint96(bound(feeBps, 0, market.MAX_FEE_BPS()));
    royaltyBps = uint96(bound(royaltyBps, 0, collection.MAX_ROYALTY_BPS()));

    vm.prank(ADMIN);
    market.setFee(FEE_RECIPIENT, feeBps);

    _listAndBuy(price, royaltyBps);

    // SELLER is also the royalty receiver here, so it collects both shares.
    uint256 distributed = market.pending(SELLER, address(0)) +
      market.pending(FEE_RECIPIENT, address(0));

    assertEq(distributed, price, 'sale did not distribute exactly the price');
    assertEq(address(market).balance, price, 'held balance should equal price');
  }

  /// The protocol fee can never exceed its cap, whatever it is set to.
  function testFuzz_feeNeverExceedsCap(uint96 price, uint96 feeBps) public {
    price = uint96(bound(price, 1, 1_000 ether));
    feeBps = uint96(bound(feeBps, 0, market.MAX_FEE_BPS()));

    vm.prank(ADMIN);
    market.setFee(FEE_RECIPIENT, feeBps);

    _listAndBuy(price, 0);

    uint256 fee = market.pending(FEE_RECIPIENT, address(0));
    assertLe(
      fee,
      (uint256(price) * market.MAX_FEE_BPS()) / 10_000,
      'fee exceeded its cap'
    );
  }

  /// A fee above the cap is always rejected, never silently clamped.
  function testFuzz_feeAboveCapReverts(uint96 feeBps) public {
    feeBps = uint96(bound(feeBps, market.MAX_FEE_BPS() + 1, type(uint96).max));

    vm.prank(ADMIN);
    vm.expectRevert();
    market.setFee(FEE_RECIPIENT, feeBps);
  }

  /// Withdrawing always pays out exactly what was owed, and clears it.
  function testFuzz_withdrawPaysExactly(uint96 price) public {
    price = uint96(bound(price, 1, 1_000 ether));
    _listAndBuy(price, 0);

    uint256 owed = market.pending(SELLER, address(0));
    uint256 before = SELLER.balance;

    vm.prank(SELLER);
    market.withdraw(address(0));

    assertEq(SELLER.balance - before, owed, 'payout did not match the balance');
    assertEq(market.pending(SELLER, address(0)), 0, 'balance not cleared');
  }

  /// Any bid below the required minimum is rejected, at any reserve.
  function testFuzz_bidBelowMinimumReverts(
    uint96 reserve,
    uint96 attempt
  ) public {
    reserve = uint96(bound(reserve, 2, 1_000 ether));
    attempt = uint96(bound(attempt, 1, reserve - 1));

    vm.startPrank(SELLER);
    uint256 tokenId = collection.mint('ipfs://a', 0);
    collection.setApprovalForAll(address(market), true);
    uint256 id = market.createAuction(
      address(collection),
      tokenId,
      1,
      address(0),
      reserve,
      uint64(block.timestamp + 1 days)
    );
    vm.stopPrank();

    vm.prank(BUYER);
    vm.expectRevert();
    market.bid{value: attempt}(id, attempt);
  }
}
