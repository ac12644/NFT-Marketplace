import executeQuery from '../../db';

export default async (req, res) => {
  try {
    console.log('req nom', req.query);
    const deviceUid = req.query.deviceUid;
    const result = await executeQuery({
      query: 'SELECT * FROM Device WHERE device_uid = ?',
      values: [deviceUid],
    });
    return res.json(result);
  } catch (error) {
    console.log(error);
    return {};
  }
};
