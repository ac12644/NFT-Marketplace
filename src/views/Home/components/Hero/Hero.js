import React from 'react';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';

const Hero = () => {
  const theme = useTheme();
  const isMd = useMediaQuery(theme.breakpoints.up('md'), {
    defaultMatches: true,
  });

  return (
    <Box bgcolor={'alternate.main'} padding={{ xs: 2, md: 4 }} borderRadius={2}>
      <Grid container spacing={4}>
        <Grid
          item
          container
          xs={12}
          md={6}
          alignItems={'center'}
          sx={{ position: 'relative' }}
        >
          <Box data-aos={isMd ? 'fade-right' : 'fade-up'} marginBottom={4}>
            <Box marginBottom={2}>
              <Typography
                variant="h3"
                component={'h3'}
                sx={{
                  fontWeight: 700,
                }}
              >
                Discover, collect, and sell extraordinary NFTs
              </Typography>
            </Box>
          </Box>
        </Grid>
        <Grid item xs={12} md={6}>
          <Box height={1} width={1} display={'flex'} justifyContent={'center'}>
            <Box
              height={1}
              width={1}
              maxWidth={{ xs: 600, md: '100%' }}
              maxHeight={500}
            >
              <Box
                component={'img'}
                src={
                  'https://images.unsplash.com/photo-1654792393225-3e8a53d124d2?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2832&q=80'
                }
                width={1}
                height={1}
                sx={{
                  filter:
                    theme.palette.mode === 'dark' ? 'brightness(0.8)' : 'none',
                }}
              />
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Hero;
