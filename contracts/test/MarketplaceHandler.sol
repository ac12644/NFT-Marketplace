// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from 'forge-std/src/Test.sol';

import {Marketplace} from '../src/Marketplace.sol';
import {MarketplaceCollection} from '../src/MarketplaceCollection.sol';

/// @dev Drives random sequences of marketplace operations for the invariant
///      run. Each function guards its own preconditions and returns quietly
///      when they do not hold, so the fuzzer spends its budget reaching real
///      states instead of bouncing off reverts.
///
///      The ghost counters mirror what the contract should hold *on top of*
///      `pending`: escrow for open offers, and the standing bid on each live
///      auction. Money moving from escrow into `pending` decrements a ghost.
contract MarketplaceHandler is Test {
  Marketplace public immutable market;
  MarketplaceCollection public immutable collection;
  address public immutable feeRecipient;

  address[3] public actors;

  uint256 public ghostOfferEscrow;
  uint256 public ghostBidEscrow;

  uint256[] private listingIds;
  uint256[] private offerIds;
  uint256[] private auctionIds;
  uint256[] private tokenIds;

  constructor(
    Marketplace market_,
    MarketplaceCollection collection_,
    address feeRecipient_
  ) {
    market = market_;
    collection = collection_;
    feeRecipient = feeRecipient_;

    actors = [address(0xA11CE), address(0xB0B), address(0xCAFE)];
    for (uint256 i = 0; i < actors.length; i++) {
      vm.deal(actors[i], 1_000 ether);
    }
  }

  function _actor(uint256 seed) private view returns (address) {
    return actors[seed % actors.length];
  }

  /* ----------------------------- operations ---------------------------- */

  function mintAndList(uint256 actorSeed, uint256 priceSeed) external {
    address actor = _actor(actorSeed);
    uint96 price = uint96(bound(priceSeed, 1, 10 ether));

    vm.startPrank(actor);
    uint256 tokenId = collection.mint('ipfs://x', 0);
    collection.setApprovalForAll(address(market), true);
    uint256 id = market.list(
      address(collection),
      tokenId,
      1,
      address(0),
      price,
      uint64(block.timestamp + 300 days)
    );
    vm.stopPrank();

    listingIds.push(id);
    tokenIds.push(tokenId);
  }

  function buy(uint256 actorSeed, uint256 idSeed) external {
    if (listingIds.length == 0) return;
    uint256 id = listingIds[idSeed % listingIds.length];

    (
      address seller,
      address payToken,
      uint256 price,
      uint64 expiry,
      bool active,

    ) = market.listings(id);

    if (!active || expiry <= block.timestamp) return;

    address buyer = _actor(actorSeed);
    if (buyer == seller || buyer.balance < price) return;

    vm.prank(buyer);
    market.buy{value: price}(id, price, payToken);
  }

  function cancelListing(uint256 idSeed) external {
    if (listingIds.length == 0) return;
    uint256 id = listingIds[idSeed % listingIds.length];

    (address seller, , , , bool active, ) = market.listings(id);
    if (!active) return;

    vm.prank(seller);
    market.cancelListing(id);
  }

  function makeOffer(uint256 actorSeed, uint256 priceSeed) external {
    if (tokenIds.length == 0) return;

    address actor = _actor(actorSeed);
    uint96 price = uint96(bound(priceSeed, 1, 5 ether));
    if (actor.balance < price) return;

    uint256 tokenId = tokenIds[priceSeed % tokenIds.length];

    vm.prank(actor);
    uint256 id = market.makeOffer{value: price}(
      address(collection),
      tokenId,
      1,
      address(0),
      price,
      uint64(block.timestamp + 30 days)
    );

    offerIds.push(id);
    ghostOfferEscrow += price;
  }

  function cancelOffer(uint256 idSeed) external {
    if (offerIds.length == 0) return;
    uint256 id = offerIds[idSeed % offerIds.length];

    (address buyer, , uint256 price, , bool active, ) = market.offers(id);
    if (!active) return;

    vm.prank(buyer);
    market.cancelOffer(id);

    ghostOfferEscrow -= price; // escrow becomes a pending balance
  }

  function acceptOffer(uint256 idSeed) external {
    if (offerIds.length == 0) return;
    uint256 id = offerIds[idSeed % offerIds.length];

    (
      address buyer,
      ,
      uint256 price,
      uint64 expiry,
      bool active,
      Marketplace.Asset memory asset
    ) = market.offers(id);

    if (!active || expiry <= block.timestamp) return;

    address owner = collection.ownerOf(asset.tokenId);
    if (owner == buyer || owner == address(market)) return;

    vm.startPrank(owner);
    collection.setApprovalForAll(address(market), true);
    market.acceptOffer(id);
    vm.stopPrank();

    ghostOfferEscrow -= price; // escrow is split into pending balances
  }

  function createAuction(uint256 actorSeed, uint256 priceSeed) external {
    address actor = _actor(actorSeed);
    uint96 reserve = uint96(bound(priceSeed, 1, 5 ether));

    vm.startPrank(actor);
    uint256 tokenId = collection.mint('ipfs://a', 0);
    collection.setApprovalForAll(address(market), true);
    uint256 id = market.createAuction(
      address(collection),
      tokenId,
      1,
      address(0),
      reserve,
      uint64(block.timestamp + 1 hours)
    );
    vm.stopPrank();

    auctionIds.push(id);
  }

  function bid(uint256 actorSeed, uint256 idSeed) external {
    if (auctionIds.length == 0) return;
    uint256 id = auctionIds[idSeed % auctionIds.length];

    (
      address seller,
      ,
      uint256 reserve,
      uint256 highest,
      address highestBidder,
      uint64 endTime,
      bool settled,

    ) = market.auctions(id);

    if (settled || block.timestamp >= endTime) return;

    address bidder = _actor(actorSeed);
    if (bidder == seller) return;

    uint256 minimum = highest == 0
      ? reserve
      : highest + (highest * market.MIN_BID_INCREMENT_BPS()) / 10_000;
    if (bidder.balance < minimum) return;

    vm.prank(bidder);
    market.bid{value: minimum}(id, minimum);

    ghostBidEscrow += minimum;
    if (highestBidder != address(0)) {
      ghostBidEscrow -= highest; // the outbid amount becomes a pending refund
    }
  }

  function settleAuction(uint256 idSeed) external {
    if (auctionIds.length == 0) return;
    uint256 id = auctionIds[idSeed % auctionIds.length];

    (, , , uint256 highest, , uint64 endTime, bool settled, ) = market
      .auctions(id);
    if (settled) return;

    if (block.timestamp < endTime) vm.warp(endTime + 1);

    market.settleAuction(id);

    if (highest > 0) {
      ghostBidEscrow -= highest; // the winning bid becomes pending balances
    }
  }

  function withdraw(uint256 actorSeed) external {
    address actor = _actor(actorSeed);
    if (market.pending(actor, address(0)) == 0) return;

    vm.prank(actor);
    market.withdraw(address(0));
  }

  /* ------------------------------ accounting --------------------------- */

  /// @notice Everything the marketplace currently owes and could pay out.
  function totalPending() external view returns (uint256 total) {
    for (uint256 i = 0; i < actors.length; i++) {
      total += market.pending(actors[i], address(0));
    }
    total += market.pending(feeRecipient, address(0));
  }
}
