import React, { useState, useRef } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  Box,
  Grid,
  TextField,
  Typography,
  IconButton,
  Collapse,
  Alert,
} from '@mui/material';
import LoadingButton from '@mui/lab/LoadingButton';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import DialogBox from 'components/DialogBox';

import web3 from 'web3';
import Web3Modal from 'web3modal';
import { ethers } from 'ethers';
import { create } from 'ipfs-http-client';
import Marketplace from 'contracts/Marketplace.sol/Marketplace.json';

const validationSchema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Nome muito curto')
    .max(50, 'Nome muito grande')
    .required('Digite um nome'),
  description: yup
    .string()
    .trim()
    .max(1000, 'Deve possuir menos de 1.000 Caracteres')
    .required('Por favor, escreva a descrição'),
  price: yup
    .string()
    .min(0, 'Preço deve ser no mínimo 0')
    .required('Digite o preço da NFT'),
  address: yup
    .string()
    .min(0, 'Preço deve ser no mínimo 3')
    .matches(
      /((https?):\/\/)?(www.)?[a-z0-9]+(\.[a-z]{2,}){1,3}(#?\/?[a-zA-Z0-9#]+)*\/?(\?[a-zA-Z0-9-_]+=[a-zA-Z0-9-%]+&?)?$/,
      'Digite a URL correta!',
    ),
  deviceUID: yup
    .string()
    .trim()
    .required('Device UID is required'),
  sensorType: yup
    .string()
    .trim()
    .required('Sensor Type is required'),
});

const Form = () => {
  const formik = useFormik({
    initialValues: {
      name: '',
      description: '',
      price: '',
      address: '',
      deviceUID: '', // New
      sensorType: '', // New
    },
    validationSchema: validationSchema,
    onSubmit: (values) => {
      setLoading(true);
      createMarket();
    },
  });

  const [open, setOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [loading, setLoading] = React.useState(false);
  const [fileUrl, setFileUrl] = useState('');
  const [dialogBoxOpen, setDialogBoxOpen] = useState(false);
  const [hash, setHash] = useState('');
  const fileInputRef = useRef(null);

  const projectId = process.env.INFURA_IPFS_ID;
  const projectSecret = process.env.INFURA_IPFS_SECRET;
  const infuraDomain = process.env.INFURA_IPFS_DOMAIN;

  const auth =
    'Basic ' + Buffer.from(projectId + ':' + projectSecret).toString('base64');

  const client = create({
    host: 'ipfs.infura.io',
    port: 5001,
    protocol: 'https',
    headers: {
      authorization: auth,
    },
  });

  async function createSale(url) {
    if (fileUrl) {
      const web3Modal = new Web3Modal({
        network: 'mainnet',
        cacheProvider: true,
      });
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const signer = provider.getSigner();

      const price = web3.utils.toWei(formik.values.price, 'ether');
      let contract = new ethers.Contract(
        process.env.MARKETPLACE_ADDRESS,
        Marketplace.abi,
        signer,
      );
      let listingPrice = await contract.getListingPrice();
      listingPrice = listingPrice.toString();
      let transaction = await contract.createToken(url, price, {
        value: listingPrice,
      });

      try {
        await transaction.wait();
        setHash(transaction.hash);
        setDialogBoxOpen(true);
      } catch (error) {
        alert('Erro ao criar NFT! Tente novamente.');
        setLoading(false);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // clear the file input
      }
      setAlertOpen(false);
      formik.resetForm();
      console.log(fileUrl);
      setLoading(false);
    }

    if (!fileUrl) return setAlertOpen(true);
  }

  async function onChange(e) {
    const file = e.target.files[0];
    try {
      const added = await client.add(file, {
        progress: (prog) => console.log(`recebido: ${prog}`),
      });
      const url = `${infuraDomain}/ipfs/${added.path}`; //DEDICATED SUBDOMAIN FROM INFURA
      setFileUrl(url);
      console.log(url);
      setOpen(true);
    } catch (error) {
      console.log('Erro ao carregar arquivo: ', error);
      setLoading(false);
      setOpen(false);
    }
  }

  async function createMarket() {
    const { name, description, price, address, deviceUID, sensorType } = formik.values;
    if (!name || !description || !price || !fileUrl) return;
    /* first, upload to IPFS */
    const data = JSON.stringify({
      name,
      description,
      address,
      image: fileUrl,
      deviceUID, // New
      sensorType, // New
    });
    try {
      const added = await client.add(data);
      const url = `${infuraDomain}/ipfs/${added.path}`;
      createSale(url);
    } catch (error) {
      console.log('Erro ao carregar arquivo: ', error);
    }
  }

  return (
    <Box>
      <form onSubmit={formik.handleSubmit}>
        <Grid container spacing={4}>
          <Grid item xs={12} sm={6}>
            <Typography
              variant={'subtitle2'}
              sx={{ marginBottom: 2, display: 'flex', alignItems: 'center' }}
              fontWeight={700}
            >
              <AttachFileIcon fontSize="medium" />
              Upload file *
            </Typography>
            <input
              type="file"
              name={'file'}
              onChange={onChange}
              ref={fileInputRef}
            />
            <Collapse in={open}>
              <Alert
                severity="success"
                sx={{ mt: 1 }}
                action={
                  <IconButton
                    aria-label="close"
                    color="inherit"
                    size="small"
                    onClick={() => {
                      setOpen(false);
                    }}
                  >
                    <CloseIcon fontSize="inherit" />
                  </IconButton>
                }
              >
                Arquivo carregado com sucesso!
              </Alert>
            </Collapse>
            <Box sx={{ width: '100%' }}>
              <Collapse in={alertOpen}>
                <Alert
                  severity="error"
                  action={
                    <IconButton
                      aria-label="close"
                      color="inherit"
                      size="small"
                      onClick={() => {
                        setAlertOpen(false);
                      }}
                    >
                      <CloseIcon fontSize="inherit" />
                    </IconButton>
                  }
                  sx={{ mb: 2 }}
                >
                  Carregue um Arquivo!
                </Alert>
              </Collapse>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography
              variant={'subtitle2'}
              sx={{ marginBottom: 2 }}
              fontWeight={700}
            >
              Nome NFT
            </Typography>
            <TextField
              label="Nome do Bioma *"
              variant="outlined"
              name={'name'}
              fullWidth
              onChange={formik.handleChange}
              value={formik.values?.name}
              error={formik.touched.name && Boolean(formik.errors.name)}
              helperText={formik.touched.name && formik.errors.name}
            />
          </Grid>
          <Grid item xs={12}>
            <Typography
              variant={'subtitle2'}
              sx={{ marginBottom: 2 }}
              fontWeight={700}
            >
              Descrição
            </Typography>
            <TextField
              label="Descrição *"
              variant="outlined"
              name={'description'}
              multiline
              rows={3}
              fullWidth
              onChange={formik.handleChange}
              value={formik.values?.description}
              error={
                formik.touched.description && Boolean(formik.errors.description)
              }
              helperText={
                formik.touched.description && formik.errors.description
              }
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography
              variant={'subtitle2'}
              sx={{ marginBottom: 2 }}
              fontWeight={700}
            >
              Preço
            </Typography>
            <TextField
              label="Valor do Bioma *"
              variant="outlined"
              name={'price'}
              fullWidth
              onChange={formik.handleChange}
              value={formik.values?.price}
              error={formik.touched.price && Boolean(formik.errors.price)}
              helperText={formik.touched.price && formik.errors.price}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography
              variant={'subtitle2'}
              sx={{ marginBottom: 2 }}
              fontWeight={700}
            >
              Link
            </Typography>
            <TextField
              label="Link para NFT"
              variant="outlined"
              name={'address'}
              fullWidth
              onChange={formik.handleChange}
              value={formik.values?.address}
              error={formik.touched.address && Boolean(formik.errors.address)}
              helperText={formik.touched.address && formik.errors.address}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant={'subtitle2'} sx={{ marginBottom: 2 }} fontWeight={700}>
              UID Dispositivo
            </Typography>
            <TextField
              label="Device UID *"
              variant="outlined"
              name={'deviceUID'}
              fullWidth
              onChange={formik.handleChange}
              value={formik.values?.deviceUID}
              error={formik.touched.deviceUID && Boolean(formik.errors.deviceUID)}
              helperText={formik.touched.deviceUID && formik.errors.deviceUID}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant={'subtitle2'} sx={{ marginBottom: 2 }} fontWeight={700}>
              Tipo de Sensor
            </Typography>
            <TextField
              label="Sensor Type *"
              variant="outlined"
              name={'sensorType'}
              fullWidth
              onChange={formik.handleChange}
              value={formik.values?.sensorType}
              error={formik.touched.sensorType && Boolean(formik.errors.sensorType)}
              helperText={formik.touched.sensorType && formik.errors.sensorType}
            />
          </Grid>

          <Grid item container xs={12}>
            <Box
              display="flex"
              flexDirection={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'stretched', sm: 'center' }}
              justifyContent={'space-between'}
              width={1}
              margin={'0 auto'}
            >
              <LoadingButton
                endIcon={<SendIcon />}
                size={'large'}
                variant={'contained'}
                type={'submit'}
                loading={loading}
                loadingPosition={'end'}
              >
                Criar
              </LoadingButton>
            </Box>
          </Grid>
        </Grid>
      </form>
      <DialogBox
        open={dialogBoxOpen}
        onClose={() => setDialogBoxOpen(false)}
        title={'Feito!'}
        message={`NFT de seu Bioma Criada com sucesso, Hash: ${hash}`}
        buttonText="Ver no polygonscan"
        buttonLink={`https://mumbai.polygonscan.com/tx/${hash}`}
      />
    </Box>
  );
};

export default Form;
