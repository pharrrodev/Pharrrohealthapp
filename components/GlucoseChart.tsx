import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { GlucoseReading } from '../types';

interface GlucoseChartProps {
  data: GlucoseReading[];
  unit: 'mg/dL' | 'mmol/L';
}

const GlucoseChart: React.FC<GlucoseChartProps> = ({ data, unit }) => {
  const sortedData = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
          <p className="font-semibold text-slate-700">{`${dataPoint.value} ${unit}`}</p>
          <p className="text-sm text-slate-500">{new Date(label).toLocaleString()}</p>
          <p className="text-sm text-slate-500 capitalize">{dataPoint.context.replace('_', ' ')}</p>
        </div>
      );
    }
    return null;
  };

  const getDotColor = (value: number) => {
    if (unit === 'mmol/L') {
      if (value > 10) return '#ef4444'; // High for mmol/L
      if (value < 4) return '#f97316';  // Low for mmol/L
    } else {
      if (value > 180) return '#ef4444'; // High for mg/dL
      if (value < 70) return '#f97316';  // Low for mg/dL
    }
    return '#3b82f6'; // In range
  };

  const highReference = unit === 'mmol/L' ? 10 : 180;
  const lowReference = unit === 'mmol/L' ? 4 : 70;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={sortedData}
        margin={{
          top: 5,
          right: 20,
          left: -10,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={formatXAxis} 
          stroke="#64748b" 
          fontSize={12}
        />
        <YAxis 
          stroke="#64748b" 
          fontSize={12}
          domain={['dataMin - 2', 'dataMax + 2']}
          allowDecimals={unit === 'mmol/L'}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={highReference} label={{ value: 'High', position: 'insideTopRight', fill: '#ef4444', fontSize: 12 }} stroke="#ef4444" strokeDasharray="3 3" />
        <ReferenceLine y={lowReference} label={{ value: 'Low', position: 'insideBottomRight', fill: '#f97316', fontSize: 12 }} stroke="#f97316" strokeDasharray="3 3" />
        <Line 
          type="monotone" 
          dataKey="value" 
          stroke="#3b82f6" 
          strokeWidth={2} 
          dot={(props) => {
            const { cx, cy, payload } = props;
            return <circle cx={cx} cy={cy} r={4} fill={getDotColor(payload.value)} stroke="#fff" strokeWidth={1} />;
          }}
          activeDot={{ r: 6 }} 
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default GlucoseChart;