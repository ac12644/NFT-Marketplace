describe('NFTMarket', function () {
  it('Should interact with the token contract', async function () {
    const marketplaceContract = await ethers.getContractFactory('Marketplace');
    const marketplace = await marketplaceContract.deploy();
    await marketplace.deployed();
    const marketAddress = marketplace.address;

    const nftContract = await ethers.getContractFactory('NFT');
    const nft = await nftContract.deploy(marketAddress);
    await nft.deployed();
    const nftContractAddress = nft.address;

    let listingPrice = await marketplace.getListingPrice();
    listingPrice = listingPrice.toString();

    const askingPrice = ethers.utils.parseUnits('1', 'ether');

    await nft.createToken('a');
    await nft.createToken('b');
    await nft.createToken('c');

    // create market item
    await marketplace.createMarketItem(nftContractAddress, 1, 1);
    await marketplace.createMarketItem(nftContractAddress, 2, 1);
    await marketplace.createMarketItem(nftContractAddress, 3, 1);

    const [_, userAddress, userAddress2] = await ethers.getSigners();

    await marketplace
      .connect(userAddress)
      .createMarketSale(nftContractAddress, 1, { value: listingPrice });
    await marketplace
      .connect(userAddress2)
      .createMarketSale(nftContractAddress, 2, { value: listingPrice });
    await marketplace
      .connect(userAddress2)
      .createMarketSale(nftContractAddress, 3, { value: listingPrice });

    transaction = await nft.createToken('d');
    transaction = await nft.createToken('e');
    transaction = await nft.createToken('f');
    transaction = await nft.createToken('g');
    transaction = await nft.createToken('h');
    transaction = await nft.createToken('i');

    await marketplace.createMarketItem(nftContractAddress, 4, listingPrice);
    await marketplace.createMarketItem(nftContractAddress, 5, listingPrice);
    await marketplace.createMarketItem(nftContractAddress, 6, listingPrice);
    await marketplace.createMarketItem(nftContractAddress, 7, listingPrice);
    await marketplace.createMarketItem(nftContractAddress, 8, listingPrice);
    await marketplace.createMarketItem(nftContractAddress, 9, listingPrice);

    //create marktet sale
    await marketplace
      .connect(userAddress2)
      .createMarketSale(nftContractAddress, 4, { value: listingPrice }); // d
    await marketplace
      .connect(userAddress2)
      .createMarketSale(nftContractAddress, 5, { value: listingPrice }); // e
    await marketplace
      .connect(userAddress2)
      .createMarketSale(nftContractAddress, 6, { value: listingPrice }); // f
    await marketplace
      .connect(userAddress2)
      .createMarketSale(nftContractAddress, 7, { value: listingPrice }); // g

    // resell token
    await marketplace
      .connect(userAddress2)
      .resellToken(nftContractAddress, 4, { value: listingPrice });
    await marketplace
      .connect(userAddress2)
      .resellToken(nftContractAddress, 5, { value: listingPrice });
    await marketplace
      .connect(userAddress2)
      .resellToken(nftContractAddress, 6, { value: listingPrice });
    await marketplace
      .connect(userAddress2)
      .resellToken(nftContractAddress, 7, { value: listingPrice });

    items = await marketplace.fetchMarketItems();
    items = await Promise.all(
      items.map(async (i) => {
        const tokenUri = await nft.tokenURI(i.tokenId);
        let item = {
          price: i.price.toNumber(),
          tokenId: i.price.toNumber(),
          seller: i.seller,
          owner: i.owner,
          tokenUri,
        };
        return item;
      }),
    );
    console.log('items: ', items);

    const myNfts = await marketplace.connect(userAddress2).fetchMyNFTs();
    console.log('myNfts:', myNfts);
  });
});
