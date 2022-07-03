import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { 
  Box, 
  Divider, 
  Typography, 
  Stack, 
  MenuItem, 
  Avatar, 
  Link, 
  IconButton 
} from '@mui/material';

import MenuPopover from 'components/MenuPopover';  

const MENU_OPTIONS = [
  {
    label: 'Assets Owned',
    route: '/assets',
  },
];

function Account({ address, icon, handleLogout }) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(null);

  const handleOpen = (event) => {
    setOpen(event.currentTarget);
  };
  const handleClose = () => {
    setOpen(null);
  };

  return (
    <>
      <IconButton
        ref={anchorRef}
        onClick={handleOpen}
        sx={{
          p: 0,
          ...(open && {
            '&:before': {
              zIndex: 1,
              content: "''",
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              position: 'absolute',
              bgcolor: (theme) => alpha(theme.palette.grey[900], 0.8),
            },
          }),
        }}
      >
        <Avatar src={icon} alt='icon' />
      </IconButton>
      <MenuPopover
        open={Boolean(open)}
        anchorEl={open}
        onClose={handleClose}
        sx={{
          p: 0,
          mt: 1.5,
          ml: 0.75,
          '& .MuiMenuItem-root': {
            typography: 'body2',
            borderRadius: 0.75,
          },
        }}
      >
        <Box sx={{ my: 1.5, px: 2.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
            {address}
          </Typography>
        </Box>

        <Divider sx={{ borderStyle: 'dashed' }} />

        <Stack sx={{ p: 1 }}>
          {MENU_OPTIONS.map((option) => (
            <MenuItem key={option.label} component={Link} href={option.route} onClick={handleClose}>
              {option.label}
            </MenuItem>
          ))}
        </Stack>

        <Divider sx={{ borderStyle: 'dashed' }} />

        <MenuItem onClick={handleLogout} sx={{ m: 1 }}>
          Logout
        </MenuItem>
      </MenuPopover>
    </>
  );
}

Account.propTypes =  {
  address: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  handleLogout: PropTypes.func.isRequired
}

export default Account;