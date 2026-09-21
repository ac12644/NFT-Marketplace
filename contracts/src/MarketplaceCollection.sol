// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import {ERC721URIStorage} from '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import {ERC721Royalty} from '@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol';
import {AccessControl} from '@openzeppelin/contracts/access/AccessControl.sol';

/// @title MarketplaceCollection
/// @notice An ERC-721 collection with per-token ERC-2981 royalties.
/// @dev Written to be deployed as an EIP-1167 clone by `CollectionFactory`, so
///      all setup happens in `initialize` rather than a constructor — a clone
///      runs the implementation's code but never its constructor.
///
///      `ERC721` keeps `_name`/`_symbol` in private storage set by its
///      constructor, which a clone skips. Rather than pull in the whole
///      upgradeable package for two strings, this overrides the `name()` and
///      `symbol()` getters (both `virtual`) and keeps its own copies. None of
///      the other bases — ERC721URIStorage, ERC2981, AccessControl — have
///      constructors, so nothing else needs special handling.
contract MarketplaceCollection is
  ERC721URIStorage,
  ERC721Royalty,
  AccessControl
{
  /// @notice Ceiling on the royalty a minter may set: 10%.
  uint96 public constant MAX_ROYALTY_BPS = 1000;

  string private _collectionName;
  string private _collectionSymbol;
  string private _contractURI;
  bool private _initialized;
  uint256 private _nextTokenId;

  event Minted(
    uint256 indexed tokenId,
    address indexed to,
    string uri,
    uint96 royaltyBps
  );

  /// @dev ERC-7572. Marketplaces watch this to refetch collection metadata.
  event ContractURIUpdated();

  error AlreadyInitialized();
  error NotInitialized();
  error RoyaltyTooHigh(uint96 max);
  error EmptyURI();
  error ZeroAddress();

  /// @dev The implementation deploys already-initialized, so nobody can claim
  ///      it directly. Only clones reach `initialize`.
  constructor() ERC721('', '') {
    _initialized = true;
  }

  /// @param contractURI_ Collection-level metadata per ERC-7572, typically
  ///        `ipfs://<cid>`. May be empty and set later with `setContractURI`.
  function initialize(
    address admin,
    string calldata name_,
    string calldata symbol_,
    string calldata contractURI_
  ) external {
    if (_initialized) revert AlreadyInitialized();
    if (admin == address(0)) revert ZeroAddress();

    _initialized = true;
    _collectionName = name_;
    _collectionSymbol = symbol_;
    _contractURI = contractURI_;
    _nextTokenId = 1;

    _grantRole(DEFAULT_ADMIN_ROLE, admin);
  }

  /// @notice Collection-level metadata (ERC-7572): name, description, image,
  ///         banner_image, featured_image, external_link, collaborators.
  function contractURI() external view returns (string memory) {
    return _contractURI;
  }

  function setContractURI(
    string calldata contractURI_
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _contractURI = contractURI_;
    emit ContractURIUpdated();
  }

  /// @param uri Metadata URI, typically `ipfs://<cid>`.
  /// @param royaltyBps Share of each secondary sale paid to the minter, in
  ///        basis points. Capped at `MAX_ROYALTY_BPS`; pass 0 for none.
  function mint(
    string calldata uri,
    uint96 royaltyBps
  ) external returns (uint256 tokenId) {
    // Keyed off the counter, not `_initialized`: the implementation marks
    // itself initialized in its constructor to block takeover, but never sets
    // a counter, so this also stops anyone minting into the implementation.
    if (_nextTokenId == 0) revert NotInitialized();
    if (bytes(uri).length == 0) revert EmptyURI();
    if (royaltyBps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh(MAX_ROYALTY_BPS);

    tokenId = _nextTokenId++;

    _safeMint(msg.sender, tokenId);
    _setTokenURI(tokenId, uri);

    if (royaltyBps > 0) {
      _setTokenRoyalty(tokenId, msg.sender, royaltyBps);
    }

    emit Minted(tokenId, msg.sender, uri, royaltyBps);
  }

  function totalMinted() external view returns (uint256) {
    return _nextTokenId == 0 ? 0 : _nextTokenId - 1;
  }

  /// @notice True once this contract can no longer be initialized. The
  ///         implementation is locked from construction; clones lock on init.
  /// @dev Read by `CollectionFactory` before accepting a new implementation —
  ///      an unlocked one could be claimed by whoever calls `initialize` first.
  function initialized() external view returns (bool) {
    return _initialized;
  }

  /* ----------------------------- overrides ----------------------------- */

  function name() public view override returns (string memory) {
    return _collectionName;
  }

  function symbol() public view override returns (string memory) {
    return _collectionSymbol;
  }

  function tokenURI(
    uint256 tokenId
  ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
    return super.tokenURI(tokenId);
  }

  function supportsInterface(
    bytes4 interfaceId
  )
    public
    view
    override(ERC721URIStorage, ERC721Royalty, AccessControl)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
