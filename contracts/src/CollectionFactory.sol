// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Clones} from '@openzeppelin/contracts/proxy/Clones.sol';
import {Ownable, Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {IERC165} from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import {IERC721} from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import {MarketplaceCollection} from './MarketplaceCollection.sol';

/// @title CollectionFactory
/// @notice Lets anyone create their own NFT collection.
/// @dev Uses EIP-1167 minimal proxies, so each collection costs a fraction of
///      a full deployment. Enumeration is via `CollectionCreated` events,
///      matching how the rest of this project indexes — no unbounded array.
///
///      The implementation can be replaced, but **only for collections created
///      afterwards**. A minimal proxy hard-codes its implementation in its own
///      runtime bytecode, so every collection already out there is frozen and
///      cannot be altered by this factory or its owner. That is the point of
///      cloning rather than using a beacon: the owner can ship better logic
///      going forward without ever reaching into what users already own.
///
///      The trust this *does* require: whoever creates a collection trusts the
///      implementation configured at that moment. The owner could point new
///      collections at hostile logic. `CollectionCreated` records the
///      implementation each collection was built from so this is auditable
///      after the fact, and the checks in `_setImplementation` catch honest
///      mistakes — but they cannot catch deliberate malice. Ownership belongs
///      behind a multisig or timelock for anything beyond a testnet.
contract CollectionFactory is Ownable2Step {
  using Clones for address;

  /// @notice The collection logic new clones will delegate to.
  address public implementation;

  /// @notice Collections this factory created. Lets consumers tell a genuine
  ///         one from an arbitrary contract claiming to be a collection.
  mapping(address collection => bool) public isCollection;

  event CollectionCreated(
    address indexed collection,
    address indexed owner,
    address indexed implementation,
    string name,
    string symbol
  );
  event ImplementationChanged(address indexed previous, address indexed next);

  error EmptyName();
  error EmptySymbol();
  error NotAContract();
  error NotACollection();
  error ImplementationNotLocked();

  constructor(address initialOwner) Ownable(initialOwner) {
    _setImplementation(address(new MarketplaceCollection()));
  }

  /// @param contractURI_ Collection-level metadata per ERC-7572. May be empty
  ///        and set later by the collection owner.
  function create(
    string calldata name,
    string calldata symbol,
    string calldata contractURI_
  ) external returns (address collection) {
    if (bytes(name).length == 0) revert EmptyName();
    if (bytes(symbol).length == 0) revert EmptySymbol();

    address logic = implementation;

    collection = logic.clone();

    // Effects and the event before the external call. `initialize` runs code
    // from whatever implementation is configured, and while a re-entrant
    // `create` here would only mint another collection, there is no reason to
    // leave the ordering to that argument.
    isCollection[collection] = true;
    emit CollectionCreated(collection, msg.sender, logic, name, symbol);

    MarketplaceCollection(collection).initialize(
      msg.sender,
      name,
      symbol,
      contractURI_
    );
  }

  /// @notice Point future collections at new logic. Existing collections are
  ///         untouched — their implementation is baked into their bytecode.
  function setImplementation(address next) external onlyOwner {
    _setImplementation(next);
  }

  function _setImplementation(address next) private {
    if (next.code.length == 0) revert NotAContract();

    // Must actually be an ERC-721, or every clone would be born broken.
    try IERC165(next).supportsInterface(type(IERC721).interfaceId) returns (
      bool ok
    ) {
      if (!ok) revert NotACollection();
    } catch {
      revert NotACollection();
    }

    // Must already be locked. An unlocked implementation can be claimed by
    // whoever calls `initialize` on it first, and anything that then mints
    // into it pollutes the template clones are made from.
    try MarketplaceCollection(next).initialized() returns (bool locked) {
      if (!locked) revert ImplementationNotLocked();
    } catch {
      revert NotACollection();
    }

    emit ImplementationChanged(implementation, next);
    implementation = next;
  }
}
