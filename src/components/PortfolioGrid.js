import React from 'react';
import PropTypes from 'prop-types';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Button from '@mui/material/Button';
import CardMedia from '@mui/material/CardMedia';
import LinkIcon from '@mui/icons-material/Link';
import Link from '@mui/material/Link';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';

import Web3Modal from 'web3modal';
import { ethers } from 'ethers';
import Marketplace from 'contracts/Marketplace.sol/Marketplace.json';

const PortfolioGrid = ({ data = [], buttonShow }) => {
  const theme = useTheme();

  async function buyNft(nft) {
    /* needs the user to sign the transaction, so will use Web3Provider and sign it */
    const web3Modal = new Web3Modal({
      network: 'mainnet',
      cacheProvider: true,
    });
    const connection = await web3Modal.connect();
    const provider = new ethers.providers.Web3Provider(connection);
    const signer = provider.getSigner();
    const marketContract = new ethers.Contract(
      process.env.MARKETPLACE_ADDRESS,
      Marketplace.abi,
      signer,
    );
    /* user will be prompted to pay the asking price to complete the transaction */
    const price = ethers.utils.parseUnits(nft.price.toString(), 'ether');

    const transaction = await marketContract.createMarketSale(nft.tokenId, {
      value: price,
    });
    await transaction.wait();
    await loadNFTs();
  }

  return (
    <Box>
      <Grid container spacing={4}>
        {data.map((item, i) => (
          <Grid item xs={12} sm={6} md={4} key={i}>
            <Box display={'block'} width={1} height={1}>
              <Box
                key={i}
                component={Card}
                width={1}
                height={1}
                display={'flex'}
                flexDirection={'column'}
              >
                <CardMedia
                  title={item.name}
                  image={item.image}
                  sx={{
                    position: 'relative',
                    height: { xs: 240, sm: 340, md: 280 },
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    display={'flex'}
                    justifyContent={'space-between'}
                    position={'absolute'}
                    bottom={0}
                    padding={2}
                    width={1}
                  >
                    <Box
                      padding={1}
                      bgcolor={'background.paper'}
                      boxShadow={1}
                      borderRadius={2}
                    >
                      <Typography sx={{ fontWeight: 600 }}>
                        {item.price} MATIC
                      </Typography>
                    </Box>
                    <Box
                      padding={1}
                      bgcolor={'background.paper'}
                      boxShadow={1}
                      borderRadius={2}
                    >
                      <Box
                        component={'svg'}
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        width={16}
                        height={16}
                        color={'primary.main'}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </Box>
                    </Box>
                  </Box>
                </CardMedia>
                <CardContent>
                  <Typography
                    variant={'h6'}
                    align={'left'}
                    sx={{ fontWeight: 700 }}
                  >
                    {item.name}
                  </Typography>
                  <Box display={'flex'} alignItems={'center'} marginY={2}>
                    <Typography variant={'subtitle2'} color="text.secondary">
                      {item.description}
                    </Typography>
                  </Box>
                  <Box display={'flex'} alignItems={'center'}>
                    <Box
                      component={'svg'}
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      width={16}
                      height={16}
                      marginRight={1}
                    >
                      <LinkIcon />
                    </Box>
                    <Typography variant={'subtitle2'} color="text.secondary">
                      <Link href={item.address} underline="none">
                        Link to NFT
                      </Link>
                    </Typography>
                  </Box>
                  <CardActions sx={{ justifyContent: 'flex-end' }}>
                    {buttonShow && (
                      <Button
                        onClick={() => buyNft(item)}
                        startIcon={
                          <Box
                            component={'svg'}
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            width={24}
                            height={24}
                          >
                            <ShoppingBagIcon />
                          </Box>
                        }
                      >
                        Buy
                      </Button>
                    )}
                  </CardActions>
                </CardContent>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

PortfolioGrid.propTypes = {
  data: PropTypes.array,
  buttonShow: PropTypes.bool,
};

export default PortfolioGrid;
