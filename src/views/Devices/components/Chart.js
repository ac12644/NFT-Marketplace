import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import { CardContent, Typography, Card, Link } from '@mui/material';
import ReactEChart from "echarts-for-react";
// import { LineChart } from '@mui/x-charts';

export default function Chart({ deviceUID }) {
  const eChartOptions = useMemo(
    () => ({
      responsive: true,
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '15%',
        containLabel: true,
      },
      xAxis: {
        scale: true,
        name: 'Abc',
        type: 'value',
        min: 0,
        max: 3,
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: {
          hideOverlap: true,
        },
        splitLine: {
          show: true,
        },
        minorTick: {
          show: false,
        },
      },
      yAxis: {
        scale: true,
        name: 'Value',
        type: 'value',
        axisTick: {
          show: false,
        },
        nameLocation: 'middle',
        nameGap: 40,
        splitLine: {
          show: false,
        },
        minorTick: {
          show: false,
        },
      },
      toolbox: {
        show: false,
      },
      tooltip: {
        show: true,
        trigger: 'axis',
        borderColor: '#505765',
        axisPointer: {
          type: 'cross',
          animation: false,
          label: {
            backgroundColor: '#505765',
          },
        },
      },
      dataset: {
        dimensions: ['index', 'readValue'],
        source: [
          { index: 0, readValue: 0 },
          {
            index: 1,
            readValue: 543,
          },
          {
            index: 2,
            readValue: 234,
          },
          {
            index: 3,
            readValue: 120,
          },
        ],
      },
      series: [
        {
          name: 'Value',
          showSymbol: false,
          clip: true,
          lineStyle: {
            width: 2,
            color: '#ff9f43',
          },
          type: 'line',
          smooth: false,
        },
      ],
    }),
    [],
  );

  return (
    <Box display={'block'} width={1} height={1}>
      <Box
        component={Card}
        width={1}
        height={1}
        display={'flex'}
        flexDirection={'column'}
      >
        <CardContent>
          <Typography variant={'h6'} align={'left'} sx={{ fontWeight: 700 }}>
            Device: {deviceUID || ""}
          </Typography>
          <Box display={'flex'} alignItems={'center'}>
            <ReactEChart
              option={eChartOptions}
              style={{ height: '400px', width: '100%' }}
            />
          </Box>
        </CardContent>
      </Box>
    </Box>
  );
}
