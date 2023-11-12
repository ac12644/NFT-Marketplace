import { useRouter } from 'next/router';
import React from 'react';
import Devices from 'views/Devices';

const DevicesPage = () => {
  const router = useRouter()

  return <Devices tokenId={router.query.tokenId} />;
};

export default DevicesPage;
