import React from 'react';
import PropTypes from 'prop-types';
import { Box, Grid, Dialog, Typography, Button } from '@mui/material';
import TokenIcon from '@mui/icons-material/Token';

const DialogBox = ({
  open,
  onClose,
  title,
  message,
  buttonLink,
  buttonText,
}) => {
  return (
    <Dialog
      onClose={onClose}
      open={open}
      maxWidth={'sm'}
      sx={{
        '& .MuiPaper-root': {
          borderRadius: 4,
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingY: { xs: 4, sm: 10 },
          paddingX: { xs: 4, sm: 12 },
        }}
      >
        <TokenIcon sx={{ fontSize: 60 }} />
        <Typography align={'center'}>
          <Typography component={'span'} fontWeight={700}>
            {title}
          </Typography>
        </Typography>
        <Typography align={'center'}>
          <Typography component={'span'} fontWeight={500}>
            {message}
          </Typography>
        </Typography>
        <Grid container spacing={2} sx={{ marginY: 4 }}>
          <Grid item xs={12}>
            <Button
              href={buttonLink}
              size={'large'}
              variant={'contained'}
              fullWidth
            >
              {buttonText}
            </Button>
          </Grid>
        </Grid>
        <Typography
          align={'center'}
          sx={{ textDecoration: 'underline', cursor: 'pointer' }}
          onClick={onClose}
        >
          Close
        </Typography>
      </Box>
    </Dialog>
  );
};
DialogBox.propTypes = {
  onClose: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  title: PropTypes.string,
  message: PropTypes.string,
  buttonText: PropTypes.string,
  buttonLink: PropTypes.string,
};
export default DialogBox;
