import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

import Main from 'layouts/Main';
import Container from 'components/Container';
import Contact from 'components/Contact';
import PortfolioGrid from 'components/PortfolioGrid';

import axios from 'axios';
import Web3Modal from 'web3modal';
import { ethers } from 'ethers';
import { marketAddress } from '/Address';
import Marketplace from '/artifacts/contracts/Marketplace.sol/Marketplace.json';

const AllNfts = () => {
  const theme = useTheme();
  const [nfts, setNfts] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadNFTs();
  }, []);

  async function loadNFTs() {
    const provider = new ethers.providers.JsonRpcProvider(
      'https://rpc-mumbai.maticvigil.com',
    );
    const marketContract = new ethers.Contract(
      marketAddress,
      Marketplace.abi,
      provider,
    );
    const data = await marketContract.fetchMarketItems();

    const items = await Promise.all(
      data.map(async (i) => {
        const tokenUri = await marketContract.tokenURI(i.tokenId);
        const meta = await axios.get(tokenUri);
        let price = ethers.utils.formatUnits(i.price.toString(), 'ether');
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
      console.log('items: ', items);
    }
    setNfts(items);
    setLoaded(true);
  }

  async function buyNft(nft) {
    /* needs the user to sign the transaction, so will use Web3Provider and sign it */
    const web3Modal = new Web3Modal();
    const connection = await web3Modal.connect();
    const provider = new ethers.providers.Web3Provider(connection);
    const signer = provider.getSigner();
    const marketContract = new ethers.Contract(
      marketAddress,
      Marketplace.abi,
      signer,
    );
    /* user will be prompted to pay the asking proces to complete the transaction */
    const price = ethers.utils.parseUnits(nft.price.toString(), 'ether');
    const transaction = await marketContract.createMarketSale(nft.tokenId, {
      value: price,
    });
    await transaction.wait();
    loadNFTs();
  }

  if (loaded && !nfts.length)
    return (
      <Main>
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
        <PortfolioGrid data={nfts} buttonName={'Buy'} buttonFunc={buyNft} />
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

export default AllNfts;
