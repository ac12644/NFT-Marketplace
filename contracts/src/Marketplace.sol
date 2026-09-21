// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC165} from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import {IERC721} from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import {IERC1155} from '@openzeppelin/contracts/token/ERC1155/IERC1155.sol';
import {IERC2981} from '@openzeppelin/contracts/interfaces/IERC2981.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {Address} from '@openzeppelin/contracts/utils/Address.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {UUPSUpgradeable} from '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import {AccessControlUpgradeable} from '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import {PausableUpgradeable} from '@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol';
// These three stay non-upgradeable on purpose. ReentrancyGuardTransient keeps
// its flag in *transient* storage, and the two holders are stateless, so none
// of them occupy a storage slot there is any layout to preserve. OpenZeppelin
// ships no upgradeable variant of them for exactly this reason.
import {ReentrancyGuardTransient} from '@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol';
import {ERC721Holder} from '@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol';
import {ERC1155Holder} from '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol';

/// @title Marketplace
/// @notice Trades any ERC-721 or ERC-1155: fixed-price listings, escrowed
///         offers, and English auctions, with ERC-2981 royalties.
/// @dev Money never leaves on a trade path. Proceeds, fees, royalties and
///      outbid refunds are credited to `pending` and claimed with `withdraw`,
///      so no counterparty can block a trade by reverting on receive.
///
///      Deliberately no OZ `Multicall`: it is delegatecall-based, so `msg.value`
///      is visible to every call in a batch and one payment could be spent
///      repeatedly against the payable entry points here.
contract Marketplace is
  Initializable,
  AccessControlUpgradeable,
  PausableUpgradeable,
  UUPSUpgradeable,
  ReentrancyGuardTransient,
  ERC721Holder,
  ERC1155Holder
{
  using SafeERC20 for IERC20;

  enum Standard {
    ERC721,
    ERC1155
  }

  struct Asset {
    address collection;
    uint256 tokenId;
    uint256 amount; // always 1 for ERC-721
    Standard standard;
  }

  struct Listing {
    address seller;
    address payToken;
    uint256 price;
    uint64 expiry;
    bool active;
    Asset asset;
  }

  struct Offer {
    address buyer;
    address payToken;
    uint256 price;
    uint64 expiry;
    bool active;
    Asset asset;
  }

  struct Auction {
    address seller;
    address payToken;
    uint256 reservePrice;
    uint256 highestBid;
    address highestBidder;
    uint64 endTime;
    bool settled;
    Asset asset;
  }

  bytes32 public constant PAUSER_ROLE = keccak256('PAUSER_ROLE');
  bytes32 public constant FEE_MANAGER_ROLE = keccak256('FEE_MANAGER_ROLE');
  /// @notice The most dangerous permission here: whoever holds it can replace
  ///         every line of this contract's logic, including the parts holding
  ///         escrowed NFTs and `pending` balances. Intended for a timelock.
  bytes32 public constant UPGRADER_ROLE = keccak256('UPGRADER_ROLE');

  uint256 private constant BPS = 10_000;

  /// @notice Ceiling on the protocol fee: 10%.
  uint96 public constant MAX_FEE_BPS = 1000;
  /// @notice Ceiling on the royalty honoured for any collection: 10%.
  uint96 public constant MAX_ROYALTY_BPS = 1000;
  /// @notice A bid must beat the standing one by this much.
  uint256 public constant MIN_BID_INCREMENT_BPS = 500;
  /// @notice A bid inside this window of the close pushes the close out by it.
  uint64 public constant AUCTION_EXTENSION = 10 minutes;
  /// @notice Upper bound on any expiry, so nothing is listed effectively forever.
  uint64 public constant MAX_DURATION = 365 days;

  address public feeRecipient;
  uint96 public feeBps;

  /// @notice Accepted payment currencies. `address(0)` is native and always on.
  mapping(address token => bool) public payTokenAllowed;

  /// @notice Claimable balances. `pending[account][address(0)]` is native.
  mapping(address account => mapping(address token => uint256))
    public pending;

  // Set in `initialize`, not here: field initialisers run in the constructor,
  // which a proxy never executes.
  uint256 public nextListingId;
  uint256 public nextOfferId;
  uint256 public nextAuctionId;

  mapping(uint256 listingId => Listing) public listings;
  mapping(uint256 offerId => Offer) public offers;
  mapping(uint256 auctionId => Auction) public auctions;

  /* Every order event is indexed by (orderId, collection, tokenId) and carries
     enough in its data to be consumed standalone. An indexer should never have
     to join a terminal event back against its creation event to learn what was
     actually traded. */
  event Listed(
    uint256 indexed listingId,
    address indexed collection,
    uint256 indexed tokenId,
    address seller,
    uint256 amount,
    address payToken,
    uint256 price,
    uint64 expiry
  );
  event ListingCancelled(
    uint256 indexed listingId,
    address indexed collection,
    uint256 indexed tokenId,
    address seller
  );
  event Sold(
    uint256 indexed listingId,
    address indexed collection,
    uint256 indexed tokenId,
    address seller,
    address buyer,
    uint256 amount,
    address payToken,
    uint256 price,
    uint256 fee
  );
  event OfferMade(
    uint256 indexed offerId,
    address indexed collection,
    uint256 indexed tokenId,
    address buyer,
    uint256 amount,
    address payToken,
    uint256 price,
    uint64 expiry
  );
  event OfferCancelled(
    uint256 indexed offerId,
    address indexed collection,
    uint256 indexed tokenId,
    address buyer
  );
  event OfferAccepted(
    uint256 indexed offerId,
    address indexed collection,
    uint256 indexed tokenId,
    address seller,
    address buyer,
    uint256 amount,
    address payToken,
    uint256 price,
    uint256 fee
  );
  event AuctionCreated(
    uint256 indexed auctionId,
    address indexed collection,
    uint256 indexed tokenId,
    address seller,
    uint256 amount,
    address payToken,
    uint256 reservePrice,
    uint64 endTime
  );
  event BidPlaced(
    uint256 indexed auctionId,
    address indexed collection,
    uint256 indexed tokenId,
    address bidder,
    uint256 amount,
    uint64 endTime
  );
  event AuctionExtended(uint256 indexed auctionId, uint64 newEndTime);
  event AuctionSettled(
    uint256 indexed auctionId,
    address indexed collection,
    uint256 indexed tokenId,
    address seller,
    address winner,
    address payToken,
    uint256 amount,
    uint256 fee
  );
  event AuctionCancelled(
    uint256 indexed auctionId,
    address indexed collection,
    uint256 indexed tokenId,
    address seller
  );
  event Withdrawn(
    address indexed account,
    address indexed token,
    uint256 amount
  );
  event FeeChanged(address indexed recipient, uint96 bps);
  event PayTokenChanged(address indexed token, bool allowed);
  event RoyaltyPaid(
    address indexed collection,
    uint256 indexed tokenId,
    address indexed receiver,
    uint256 amount
  );

  error NotAContract(address target);
  error UnsupportedCollection(address collection);
  error BadAmount();
  error ZeroPrice();
  error BadExpiry();
  error PayTokenNotAllowed(address token);
  error NotTokenOwner();
  error NotApproved();
  error NotActive();
  error Expired();
  error SelfTrade();
  error TermsChanged(uint256 price, address payToken);
  error WrongPayment(uint256 expected);
  error UnexpectedNative();
  error NotSeller();
  error NotBuyer();
  error BidTooLow(uint256 minimum);
  error AuctionLive();
  error AuctionHasBids();
  error AlreadySettled();
  error NothingToWithdraw();
  error FeeTooHigh(uint96 max);
  error ZeroAddress();
  error FeeExceedsPrice();

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    // Without this the implementation behind the proxy can be initialized by
    // anyone, who could then call `upgradeToAndCall` on it directly. That is
    // the classic way a UUPS implementation gets hijacked or bricked.
    _disableInitializers();
  }

  /// @param upgrader Address allowed to perform upgrades. Pass a
  ///        TimelockController so changes are announced and users can exit
  ///        through `withdraw` before one lands.
  function initialize(
    address admin,
    address initialFeeRecipient,
    uint96 initialFeeBps,
    address upgrader
  ) external initializer {
    if (admin == address(0) || upgrader == address(0)) revert ZeroAddress();

    __AccessControl_init();
    __Pausable_init();

    _grantRole(DEFAULT_ADMIN_ROLE, admin);
    _grantRole(PAUSER_ROLE, admin);
    _grantRole(FEE_MANAGER_ROLE, admin);

    // UPGRADER_ROLE administers itself. Without this, DEFAULT_ADMIN_ROLE
    // administers every role by default and the admin key could simply grant
    // itself the upgrade permission, making the timelock decorative. Now only
    // an existing upgrader — the timelock — can hand that power out.
    _setRoleAdmin(UPGRADER_ROLE, UPGRADER_ROLE);
    _grantRole(UPGRADER_ROLE, upgrader);

    nextListingId = 1;
    nextOfferId = 1;
    nextAuctionId = 1;

    _setFee(initialFeeRecipient, initialFeeBps);
    payTokenAllowed[address(0)] = true; // native
  }

  /// @dev Gate on `UPGRADER_ROLE`, deliberately separate from the admin role
  ///      that sets fees and pauses, so one hot key cannot do both.
  function _authorizeUpgrade(
    address
  ) internal override onlyRole(UPGRADER_ROLE) {}

  /* ============================ listings ============================== */

  function list(
    address collection,
    uint256 tokenId,
    uint256 amount,
    address payToken,
    uint256 price,
    uint64 expiry
  ) external whenNotPaused returns (uint256 listingId) {
    Asset memory asset = _buildAsset(collection, tokenId, amount);
    _requirePayToken(payToken);
    _requirePrice(price);
    _requireExpiry(expiry);
    _requireOwnsAndApproved(asset, msg.sender);

    listingId = nextListingId++;
    listings[listingId] = Listing({
      seller: msg.sender,
      payToken: payToken,
      price: price,
      expiry: expiry,
      active: true,
      asset: asset
    });

    emit Listed(
      listingId,
      collection,
      tokenId,
      msg.sender,
      amount,
      payToken,
      price,
      expiry
    );
  }

  /// @param expectedPrice Guards against the seller re-pricing in front of you.
  function buy(
    uint256 listingId,
    uint256 expectedPrice,
    address expectedPayToken
  ) external payable nonReentrant whenNotPaused {
    Listing storage listing = listings[listingId];

    if (!listing.active) revert NotActive();
    if (listing.expiry <= block.timestamp) revert Expired();
    if (listing.seller == msg.sender) revert SelfTrade();
    if (listing.price != expectedPrice || listing.payToken != expectedPayToken) {
      revert TermsChanged(listing.price, listing.payToken);
    }

    Asset memory asset = listing.asset;
    address seller = listing.seller;
    address payToken = listing.payToken;
    uint256 price = listing.price;

    // The seller may have moved the token or revoked approval since listing.
    _requireOwnsAndApproved(asset, seller);

    listing.active = false;

    _takePayment(payToken, price);
    uint256 fee = _settle(asset, seller, payToken, price);

    emit Sold(
      listingId,
      asset.collection,
      asset.tokenId,
      seller,
      msg.sender,
      asset.amount,
      payToken,
      price,
      fee
    );
    _transferAsset(asset, seller, msg.sender);
  }

  /// @dev Intentionally callable while paused — users must always be able to exit.
  function cancelListing(uint256 listingId) external {
    Listing storage listing = listings[listingId];

    if (!listing.active) revert NotActive();
    if (listing.seller != msg.sender) revert NotSeller();

    listing.active = false;
    emit ListingCancelled(
      listingId,
      listing.asset.collection,
      listing.asset.tokenId,
      msg.sender
    );
  }

  /* ============================= offers =============================== */

  /// @notice Offer on any token, listed or not. Funds are escrowed now.
  function makeOffer(
    address collection,
    uint256 tokenId,
    uint256 amount,
    address payToken,
    uint256 price,
    uint64 expiry
  ) external payable nonReentrant whenNotPaused returns (uint256 offerId) {
    Asset memory asset = _buildAsset(collection, tokenId, amount);
    _requirePayToken(payToken);
    _requirePrice(price);
    _requireExpiry(expiry);

    offerId = nextOfferId++;
    offers[offerId] = Offer({
      buyer: msg.sender,
      payToken: payToken,
      price: price,
      expiry: expiry,
      active: true,
      asset: asset
    });

    _takePayment(payToken, price);

    emit OfferMade(
      offerId,
      collection,
      tokenId,
      msg.sender,
      amount,
      payToken,
      price,
      expiry
    );
  }

  function acceptOffer(uint256 offerId) external nonReentrant whenNotPaused {
    Offer storage offer = offers[offerId];

    if (!offer.active) revert NotActive();
    if (offer.expiry <= block.timestamp) revert Expired();
    if (offer.buyer == msg.sender) revert SelfTrade();

    Asset memory asset = offer.asset;
    address buyer = offer.buyer;
    address payToken = offer.payToken;
    uint256 price = offer.price;

    _requireOwnsAndApproved(asset, msg.sender);

    offer.active = false;

    // Funds are already escrowed, so this only splits them.
    uint256 fee = _settle(asset, msg.sender, payToken, price);

    emit OfferAccepted(
      offerId,
      asset.collection,
      asset.tokenId,
      msg.sender,
      buyer,
      asset.amount,
      payToken,
      price,
      fee
    );
    _transferAsset(asset, msg.sender, buyer);
  }

  /// @dev Callable while paused, and after expiry, so escrow is never stuck.
  function cancelOffer(uint256 offerId) external {
    Offer storage offer = offers[offerId];

    if (!offer.active) revert NotActive();
    if (offer.buyer != msg.sender) revert NotBuyer();

    offer.active = false;
    pending[msg.sender][offer.payToken] += offer.price;

    emit OfferCancelled(
      offerId,
      offer.asset.collection,
      offer.asset.tokenId,
      msg.sender
    );
  }

  /* ============================ auctions ============================== */

  /// @dev The asset is escrowed here, so a seller cannot move it out from under
  ///      live bids and leave bidders' funds locked until expiry.
  function createAuction(
    address collection,
    uint256 tokenId,
    uint256 amount,
    address payToken,
    uint256 reservePrice,
    uint64 endTime
  ) external nonReentrant whenNotPaused returns (uint256 auctionId) {
    Asset memory asset = _buildAsset(collection, tokenId, amount);
    _requirePayToken(payToken);
    _requirePrice(reservePrice);
    _requireExpiry(endTime);
    _requireOwnsAndApproved(asset, msg.sender);

    auctionId = nextAuctionId++;
    auctions[auctionId] = Auction({
      seller: msg.sender,
      payToken: payToken,
      reservePrice: reservePrice,
      highestBid: 0,
      highestBidder: address(0),
      endTime: endTime,
      settled: false,
      asset: asset
    });

    emit AuctionCreated(
      auctionId,
      collection,
      tokenId,
      msg.sender,
      amount,
      payToken,
      reservePrice,
      endTime
    );

    _transferAsset(asset, msg.sender, address(this));
  }

  function bid(
    uint256 auctionId,
    uint256 amount
  ) external payable nonReentrant whenNotPaused {
    Auction storage auction = auctions[auctionId];

    if (auction.seller == address(0) || auction.settled) revert NotActive();
    if (block.timestamp >= auction.endTime) revert Expired();
    if (auction.seller == msg.sender) revert SelfTrade();

    uint256 minimum = auction.highestBid == 0
      ? auction.reservePrice
      : auction.highestBid +
        (auction.highestBid * MIN_BID_INCREMENT_BPS) /
        BPS;
    if (amount < minimum) revert BidTooLow(minimum);

    address previousBidder = auction.highestBidder;
    uint256 previousBid = auction.highestBid;

    auction.highestBidder = msg.sender;
    auction.highestBid = amount;

    // Anti-sniping: a late bid buys everyone else more time.
    if (auction.endTime - block.timestamp < AUCTION_EXTENSION) {
      auction.endTime = uint64(block.timestamp) + AUCTION_EXTENSION;
      emit AuctionExtended(auctionId, auction.endTime);
    }

    _takePayment(auction.payToken, amount);

    if (previousBidder != address(0)) {
      pending[previousBidder][auction.payToken] += previousBid;
    }

    emit BidPlaced(
      auctionId,
      auction.asset.collection,
      auction.asset.tokenId,
      msg.sender,
      amount,
      auction.endTime
    );
  }

  /// @notice Anyone may settle once the clock runs out.
  /// @dev Callable while paused so escrowed assets are never stuck.
  function settleAuction(uint256 auctionId) external nonReentrant {
    Auction storage auction = auctions[auctionId];

    if (auction.seller == address(0)) revert NotActive();
    if (auction.settled) revert AlreadySettled();
    if (block.timestamp < auction.endTime) revert AuctionLive();

    auction.settled = true;

    Asset memory asset = auction.asset;
    address winner = auction.highestBidder;

    if (winner == address(0)) {
      emit AuctionSettled(
        auctionId,
        asset.collection,
        asset.tokenId,
        auction.seller,
        address(0),
        auction.payToken,
        0,
        0
      );
      _transferAsset(asset, address(this), auction.seller);
      return;
    }

    uint256 fee = _settle(
      asset,
      auction.seller,
      auction.payToken,
      auction.highestBid
    );

    emit AuctionSettled(
      auctionId,
      asset.collection,
      asset.tokenId,
      auction.seller,
      winner,
      auction.payToken,
      auction.highestBid,
      fee
    );
    _transferAsset(asset, address(this), winner);
  }

  function cancelAuction(uint256 auctionId) external nonReentrant {
    Auction storage auction = auctions[auctionId];

    if (auction.seller == address(0)) revert NotActive();
    if (auction.seller != msg.sender) revert NotSeller();
    if (auction.settled) revert AlreadySettled();
    if (auction.highestBidder != address(0)) revert AuctionHasBids();

    auction.settled = true;

    emit AuctionCancelled(
      auctionId,
      auction.asset.collection,
      auction.asset.tokenId,
      msg.sender
    );
    _transferAsset(auction.asset, address(this), msg.sender);
  }

  /* ============================= payouts ============================== */

  /// @notice Claim everything owed to you in one currency.
  /// @dev Never pausable — funds must always be reachable.
  function withdraw(address token) external nonReentrant {
    uint256 amount = pending[msg.sender][token];
    if (amount == 0) revert NothingToWithdraw();

    pending[msg.sender][token] = 0;
    emit Withdrawn(msg.sender, token, amount);

    if (token == address(0)) {
      Address.sendValue(payable(msg.sender), amount);
    } else {
      IERC20(token).safeTransfer(msg.sender, amount);
    }
  }

  /* ============================== admin =============================== */

  function setFee(
    address recipient,
    uint96 bps
  ) external onlyRole(FEE_MANAGER_ROLE) {
    _setFee(recipient, bps);
  }

  function setPayToken(
    address token,
    bool allowed
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (token == address(0)) revert ZeroAddress(); // native is always on
    payTokenAllowed[token] = allowed;
    emit PayTokenChanged(token, allowed);
  }

  function pause() external onlyRole(PAUSER_ROLE) {
    _pause();
  }

  function unpause() external onlyRole(PAUSER_ROLE) {
    _unpause();
  }

  /* ============================ internals ============================= */

  function _setFee(address recipient, uint96 bps) private {
    if (recipient == address(0)) revert ZeroAddress();
    if (bps > MAX_FEE_BPS) revert FeeTooHigh(MAX_FEE_BPS);

    feeRecipient = recipient;
    feeBps = bps;
    emit FeeChanged(recipient, bps);
  }

  /// @dev The token standard is detected, never taken from the caller, so the
  ///      wrong transfer function can't be induced.
  function _buildAsset(
    address collection,
    uint256 tokenId,
    uint256 amount
  ) private view returns (Asset memory) {
    Standard standard = _detectStandard(collection);

    if (standard == Standard.ERC721) {
      if (amount != 1) revert BadAmount();
    } else if (amount == 0) {
      revert BadAmount();
    }

    return Asset(collection, tokenId, amount, standard);
  }

  function _detectStandard(
    address collection
  ) private view returns (Standard) {
    if (collection.code.length == 0) revert NotAContract(collection);

    try
      IERC165(collection).supportsInterface(type(IERC721).interfaceId)
    returns (bool ok) {
      if (ok) return Standard.ERC721;
    } catch {}

    try
      IERC165(collection).supportsInterface(type(IERC1155).interfaceId)
    returns (bool ok) {
      if (ok) return Standard.ERC1155;
    } catch {}

    revert UnsupportedCollection(collection);
  }

  function _requireOwnsAndApproved(
    Asset memory asset,
    address owner
  ) private view {
    if (asset.standard == Standard.ERC721) {
      if (IERC721(asset.collection).ownerOf(asset.tokenId) != owner) {
        revert NotTokenOwner();
      }
      if (
        IERC721(asset.collection).getApproved(asset.tokenId) != address(this) &&
        !IERC721(asset.collection).isApprovedForAll(owner, address(this))
      ) {
        revert NotApproved();
      }
    } else {
      if (
        IERC1155(asset.collection).balanceOf(owner, asset.tokenId) <
        asset.amount
      ) {
        revert NotTokenOwner();
      }
      if (!IERC1155(asset.collection).isApprovedForAll(owner, address(this))) {
        revert NotApproved();
      }
    }
  }

  function _transferAsset(
    Asset memory asset,
    address from,
    address to
  ) private {
    if (asset.standard == Standard.ERC721) {
      IERC721(asset.collection).safeTransferFrom(from, to, asset.tokenId);
    } else {
      IERC1155(asset.collection).safeTransferFrom(
        from,
        to,
        asset.tokenId,
        asset.amount,
        ''
      );
    }
  }

  function _takePayment(address payToken, uint256 amount) private {
    if (payToken == address(0)) {
      if (msg.value != amount) revert WrongPayment(amount);
    } else {
      if (msg.value != 0) revert UnexpectedNative();
      IERC20(payToken).safeTransferFrom(msg.sender, address(this), amount);
    }
  }

  /// @dev Splits an already-collected `price` between royalty, fee and seller.
  function _settle(
    Asset memory asset,
    address seller,
    address payToken,
    uint256 price
  ) private returns (uint256 fee) {
    fee = (price * feeBps) / BPS;
    (address royaltyReceiver, uint256 royalty) = _royalty(asset, price);

    uint256 deductions = fee + royalty;
    // Both inputs are capped at 10%, so this is unreachable — kept as a
    // backstop because getting it wrong would mint money.
    if (deductions > price) revert FeeExceedsPrice();

    if (fee > 0) {
      pending[feeRecipient][payToken] += fee;
    }
    if (royalty > 0) {
      pending[royaltyReceiver][payToken] += royalty;
      emit RoyaltyPaid(
        asset.collection,
        asset.tokenId,
        royaltyReceiver,
        royalty
      );
    }
    pending[seller][payToken] += price - deductions;
  }

  /// @dev `royaltyInfo` is a call into an untrusted contract. A collection that
  ///      reverts, lies, or claims the whole sale degrades to zero royalty
  ///      rather than bricking every trade of that collection.
  function _royalty(
    Asset memory asset,
    uint256 price
  ) private view returns (address receiver, uint256 amount) {
    try
      IERC165(asset.collection).supportsInterface(type(IERC2981).interfaceId)
    returns (bool ok) {
      if (!ok) return (address(0), 0);
    } catch {
      return (address(0), 0);
    }

    try IERC2981(asset.collection).royaltyInfo(asset.tokenId, price) returns (
      address candidate,
      uint256 value
    ) {
      if (candidate == address(0) || value == 0) return (address(0), 0);

      uint256 cap = (price * MAX_ROYALTY_BPS) / BPS;
      return (candidate, value > cap ? cap : value);
    } catch {
      return (address(0), 0);
    }
  }

  function _requirePayToken(address payToken) private view {
    if (!payTokenAllowed[payToken]) revert PayTokenNotAllowed(payToken);
  }

  function _requirePrice(uint256 price) private pure {
    if (price == 0) revert ZeroPrice();
  }

  function _requireExpiry(uint64 expiry) private view {
    if (
      expiry <= block.timestamp || expiry > block.timestamp + MAX_DURATION
    ) {
      revert BadExpiry();
    }
  }

  function supportsInterface(
    bytes4 interfaceId
  )
    public
    view
    override(AccessControlUpgradeable, ERC1155Holder)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
