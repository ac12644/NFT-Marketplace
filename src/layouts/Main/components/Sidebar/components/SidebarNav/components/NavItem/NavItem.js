import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { alpha, useTheme } from '@mui/material/styles';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

const NavItem = ({ items }) => {
  const theme = useTheme();
  const [activeLink, setActiveLink] = useState('');
  useEffect(() => {
    setActiveLink(window && window.location ? window.location.pathname : '');
  }, []);

  return (
    <Box>
      <Grid container spacing={1}>
        {items.map((p, i) => (
          <Grid item key={i} xs={12}>
            <Button
              size={'large'}
              component={'a'}
              href={p.href}
              fullWidth
              sx={{
                justifyContent: 'flex-start',
                color:
                  activeLink === p.href
                    ? theme.palette.primary.main
                    : theme.palette.text.primary,
                backgroundColor:
                  activeLink === p.href
                    ? alpha(theme.palette.primary.main, 0.1)
                    : 'transparent',
                fontWeight: activeLink === p.href ? 600 : 400,
              }}
            >
              {p.title}
              {p.isNew && (
                <Box
                  padding={0.5}
                  display={'inline-flex'}
                  borderRadius={1}
                  bgcolor={'primary.main'}
                  marginLeft={2}
                >
                  <Typography
                    variant={'caption'}
                    sx={{ color: 'common.white', lineHeight: 1 }}
                  >
                    new
                  </Typography>
                </Box>
              )}
            </Button>
          </Grid>
        ))}
      </Grid>
      
    </Box>
  );
};

NavItem.propTypes = {
  items: PropTypes.array.isRequired,
  onClose: PropTypes.func,
};

export default NavItem;
