import Skeleton from '@mui/material/Skeleton';
import Blockies from 'react-blockies';
import { useMoralis } from 'react-moralis';

function Blockie(props) {
  const { account, isAuthenticated } = useMoralis();
  if (!props.address && (!account || !isAuthenticated))
    return <Skeleton variant='circular' width={40} height={40} />;

  return (
    <Blockies
      seed={
        props.currentWallet
          ? account.toLowerCase()
          : props.address.toLowerCase()
      }
      {...props}
    />
  );
}

export default Blockie;
