import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

import Main from 'layouts/Main';
import Container from 'components/Container';
import HomeGrid from 'components/HomeGrid';
import Contact from 'components/Contact';
import Hero from './components/Hero';
import FeaturedNfts from './components/FeaturedNfts';

import axios from 'axios';
import web3 from 'web3';
import Web3Modal from 'web3modal';
import { ethers } from 'ethers';
import { marketAddress, nftAddress } from '/Address';
import Marketplace from '/artifacts/contracts/Marketplace.sol/Marketplace.json';
import NFT from '/artifacts/contracts/NFT.sol/NFT.json';

const Home = () => {
  const theme = useTheme();
  const [nfts, setNfts] = useState([]);
  const [loadingState, setLoadingState] = useState(true);

  useEffect(() => {
    loadNFTs();
  }, []);

  async function loadNFTs() {
    const provider = new ethers.providers.JsonRpcProvider(
      'https://rpc-mumbai.maticvigil.com',
    );
    const tokenContract = new ethers.Contract(nftAddress, NFT.abi, provider);
    const marketContract = new ethers.Contract(
      marketAddress,
      Marketplace.abi,
      provider,
    );
    const data = await marketContract.fetchMarketItems();

    const items = await Promise.all(
      data.map(async (i) => {
        const tokenUri = await tokenContract.tokenURI(i.tokenId);
        const meta = await axios.get(tokenUri);
        let price = web3.utils.fromWei(i.price.toString(), 'ether');
        let item = {
          price,
          tokenId: i.tokenId.toNumber(),
          seller: i.seller,
          owner: i.owner,
          image: meta.data.image,
          name: meta.data.name,
          description: meta.data.description,
          address: meta.data.address,
        };
        return item;
      }),
    );
    {
      /* console.log('items: ', items);  */
    }
    setNfts(items);
    setLoadingState(false);
  }

  async function buyNft({ nft }) {
    const web3Modal = new Web3Modal({
      network: 'mainnet',
      cacheProvider: true,
    });
    const connection = await web3Modal.connect();
    const provider = new ethers.providers.Web3Provider(connection);
    const signer = provider.getSigner();
    const contract = new ethers.Contract(
      marketAddress,
      Marketplace.abi,
      signer,
    );

    const price = web3.utils.toWei(nft.price.toString(), 'ether');

    const transaction = await contract.createMarketSale(
      nftAddress,
      nft.tokenId,
      {
        value: price,
      },
    );

    await transaction.wait();
    loadNFTs();
  }

  if (loadingState && !nfts.length)
    return (
      <Main>
        <Container>
          <Hero />
        </Container>
        <Box
          position={'relative'}
          marginTop={{ xs: 4, md: 6 }}
          sx={{
            backgroundColor: theme.palette.alternate.main,
          }}
        >
          <Box
            component={'svg'}
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            x="0px"
            y="0px"
            viewBox="0 0 1920 100.1"
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: 'translateY(-50%)',
              zIndex: 2,
              width: 1,
            }}
          >
            <path
              fill={theme.palette.alternate.main}
              d="M0,0c0,0,934.4,93.4,1920,0v100.1H0L0,0z"
            ></path>
          </Box>
        </Box>
        <Container>
          <Contact />
        </Container>
      </Main>
    );
  return (
    <Main>
      <Container>
        <Hero />
      </Container>
      <Container paddingY={3}>
        <HomeGrid data={nfts} buttonName={'Buy'} buttonFunc={buyNft} />
      </Container>
      <Container>
        <FeaturedNfts data={nfts} buttonFunc={buyNft} />
      </Container>
      <Box
        position={'relative'}
        marginTop={{ xs: 4, md: 6 }}
        sx={{
          backgroundColor: theme.palette.alternate.main,
        }}
      >
        <Box
          component={'svg'}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          x="0px"
          y="0px"
          viewBox="0 0 1920 100.1"
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            transform: 'translateY(-50%)',
            zIndex: 2,
            width: 1,
          }}
        >
          <path
            fill={theme.palette.alternate.main}
            d="M0,0c0,0,934.4,93.4,1920,0v100.1H0L0,0z"
          ></path>
        </Box>
        <Container>
          <Contact />
        </Container>
      </Box>
    </Main>
  );
};

export default Home;
