import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

import Main from 'layouts/Main';
import Container from 'components/Container';
import Hero from 'components/Hero';
import PortfolioGrid from 'components/PortfolioGrid';
import Contact from 'components/Contact';

import web3 from 'web3';
import axios from 'axios';
import Web3Modal from 'web3modal';
import { marketAddress, nftAddress } from '/Address';
import Marketplace from '/artifacts/contracts/Marketplace.sol/Marketplace.json';
import NFT from '/artifacts/contracts/NFT.sol/NFT.json';
import { ethers } from 'ethers';

export default function Dashboard() {
  const theme = useTheme();
  const [nfts, setNfts] = useState([]);
  const [loadingState, setLoadingState] = useState(true);

  async function loadNFTs() {
    const web3Modal = new Web3Modal({
      network: "mainnet",
      cacheProvider: true,
    });

    const connection = await web3Modal.connect();
    const provider = new ethers.providers.Web3Provider(connection);
    const signer = provider.getSigner();
      
    const marketContract = new ethers.Contract(marketAddress, Marketplace.abi, signer);
    const tokenContract = new ethers.Contract(nftAddress, NFT.abi, provider);
    const data = await marketContract.fetchMyNFTs()
    
    const items = await Promise.all(data.map(async i => {
      const tokenUri = await tokenContract.tokenURI(i.tokenId)
      const meta = await axios.get(tokenUri)
      let price = web3.utils.fromWei(i.price.toString(), 'ether');
      let item = {
        price,
        tokenId: i.tokenId.toNumber(),
        seller: i.seller,
        owner: i.owner,
        image: meta.data.image,
      }
      return item
    }))
   {/* console.log('items: ', items)  */} 
    setNfts(items)
    setLoadingState(true) 
  }
  if (loadingState == true && !nfts.length) {
    return (
        <Main>
          <Container>
            <Hero title= 'No Assets Owned' />
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
    )
  }

  return (
    <Main>
      <Container>
        <Hero title='A platform to create and trade NFTs.' />
      </Container>
      <Container paddingY={'0 !important'}>
        <PortfolioGrid 
          data={nfts} 
          buttonName='List For Sale'
          buttonFunc={listNFT}
        />
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
  )
}