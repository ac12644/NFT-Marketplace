import React from 'react';
import PropTypes from 'prop-types';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';


const HomeGrid = ({data=[], buttonFunc, buttonName}) => {
  const theme = useTheme();
  return (
    <Box>
      <Box marginBottom={4}>
      <Typography
          sx={{
            textTransform: 'uppercase',
            fontWeight: 'medium',
          }}
          gutterBottom
          color={'secondary'}
          align={'center'}
        >
          Popular NFTs
        </Typography>
        <Typography
          variant="h4"
          align={'center'}
          data-aos={'fade-up'}
          gutterBottom
          sx={{
            fontWeight: 700,
          }}
        >
          Browse our popular NFTs
        </Typography>
        </Box>
    <Grid container spacing={{ xs: 2, sm: 4 }}>
      <Grid item xs={12} md={5}>
        {data.map((item, i) => 
          <Card
            key={i}
            elevation={3}
            sx={{
              p: { xs: 2, sm: 4 },
              height: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Box sx={{ p: 4, mb: 2 }}>
              <Box
                component={LazyLoadImage}
                effect="blur"
                src={item.image}
                width={1}
                maxWidth={1}
                sx={{
                  filter:
                    theme.palette.mode === 'dark' ? 'brightness(0.5)' : 'none',
                }}
              />
            </Box>
            <Box>
              <Typography
                color={'primary'}
                fontWeight={700}
                variant={'caption'}
                sx={{ textTransform: 'uppercase' }}
              >
                {item.price} ETH
              </Typography>
              <Typography variant={'h5'} fontWeight={700} marginY={1}>
                {item.name}
              </Typography>
              <Typography color={'text.secondary'}>
                {item.description}
              </Typography>
              <Link
                onClick={()=>buttonFunc(item)}
                variant={'subtitle2'}
                color={'primary'}
                fontWeight={700}
                underline={'hover'}
                sx={{
                  textTransform: 'uppercase',
                  display: 'block',
                  cursor: 'pointer',
                  mt: { xs: 2, sm: 4 },
                }}
              >
                {buttonName}
              </Link>
            </Box>
          </Card>
         )[5]}
      </Grid>

      <Grid item xs={12} md={7}>
        <Grid container spacing={{ xs: 2, sm: 4 }}>
          <Grid item xs={12} >
            {data.map((item, i) => 
              <Card
                key={i}
                elevation={3}
                sx={{
                  p: { xs: 2, sm: 4 },
                  maxHeight: 1,
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row-reverse' },
                  alignItems: 'center',
                }}
              >
                <Box sx={{ p: 4, mb: 2 }}>
                  <Box
                    component={LazyLoadImage}
                    effect="blur"
                    src={item.image}
                    width={1}
                    maxWidth={1}
                    sx={{
                      filter:
                        theme.palette.mode === 'dark'
                          ? 'brightness(0.5)'
                          : 'none',
                    }}
                  />
                </Box>
                <Box>
                  <Typography
                    color={'primary'}
                    fontWeight={700}
                    variant={'caption'}
                    sx={{ textTransform: 'uppercase' }}
                  >
                    {item.price} ETH
                  </Typography>
                  <Typography variant={'h5'} fontWeight={700} marginY={1}>
                    {item.name}
                  </Typography>
                  <Typography color={'text.secondary'}>
                    {item.description}
                  </Typography>
                  <Link
                    onClick={()=>buttonFunc(item)}
                    variant={'subtitle2'}
                    color={'primary'}
                    fontWeight={700}
                    underline={'hover'}
                    sx={{
                      textTransform: 'uppercase',
                      display: 'block',
                      cursor: 'pointer',
                      mt: { xs: 2, sm: 4 },
                    }}
                  >
                    {buttonName}
                  </Link>
                 
                </Box>
              </Card>
            )[5]}
          </Grid>

          <Grid item xs={12}>
            {data.map((item, i) => 
              <Card
                elevation={3}
                sx={{
                  p: { xs: 2, sm: 4 },
                  maxHeight: 1,
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: 'center',
                }}
              >
                <Box sx={{ p: 4, mb: 2 }}>
                  <Box
                    component={LazyLoadImage}
                    effect="blur"
                    src={item.image}
                    width={1}
                    maxWidth={1}
                    sx={{
                      filter:
                        theme.palette.mode === 'dark'
                          ? 'brightness(0.5)'
                          : 'none',
                    }}
                  />
                </Box>
                <Box>
                  <Typography
                    color={'primary'}
                    fontWeight={700}
                    variant={'caption'}
                    sx={{ textTransform: 'uppercase' }}
                  >
                    {item.price} ETH
                  </Typography>
                  <Typography variant={'h5'} fontWeight={700} marginY={1}>
                    {item.name}
                  </Typography>
                  <Typography color={'text.secondary'}>
                    {item.description}
                  </Typography>
                  <Link
                    onClick={()=>buttonFunc(item)}
                    variant={'subtitle2'}
                    color={'primary'}
                    fontWeight={700}
                    underline={'hover'}
                    sx={{
                      textTransform: 'uppercase',
                      display: 'block',
                      cursor: 'pointer',
                      mt: { xs: 2, sm: 4 },
                    }}
                  >
                    {buttonName}
                  </Link>
                </Box>
              </Card>
             )[5]}
          </Grid>
        </Grid>
      </Grid>
    </Grid>
 
  
    </Box>
  );
};

HomeGrid.propTypes = {
    buttonFunc: PropTypes.func,
    data: PropTypes.array,
    buttonName: PropTypes.string,
};
  
export default HomeGrid;
