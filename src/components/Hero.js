import React from 'react';
import Typed from 'react-typed';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const Hero = ({ title }) => {
  return (
    <Box>
      <Box marginBottom={4}>
        {/* 
        <Typography
          variant="h6"
          component="p"
          color="text.secondary"
          align={'center'}
          gutterBottom
          sx={{ fontWeight: 400 }}
        >
         subtitle
        </Typography> 
        */}
        <Typography
          variant="h3"
          color="text.primary"
          align={'center'}
          sx={{
            fontWeight: 700,
          }}
        >
          <Typed
            strings={[title]}
            typeSpeed={100}
            loop={false}
          />
        </Typography>
      </Box>
    </Box>
  );
};

Hero.propTypes =  {
    title: PropTypes.string.isRequired
}

export default Hero;
