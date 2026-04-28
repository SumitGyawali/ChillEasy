import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, ReferenceArea, Tooltip, CartesianGrid, ReferenceDot } from 'recharts';

export default function TempHistoryChart({ telemetry, low = 2, high = 8, alerts = [] }) {
  // last 60 minutes
  const cutoff = Date.now() - 60 * 60 * 1000;
  const data = telemetry
    .filter((p) => new Date(p.t).getTime() >= cutoff)
    .map((p) => ({ ts: new Date(p.t).getTime(), temp: +p.temp.toFixed(2) }));

  const excursions = alerts
    .filter((a) => ['TEMP_HIGH', 'TEMP_LOW'].includes(a.type))
    .map((a) => ({ ts: new Date(a.timestamp).getTime(), temp: a.payload?.temp }))
    .filter((x) => Number.isFinite(x.temp) && x.ts >= cutoff);

  const fmt = (t) => {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-[240px]" data-testid="temp-history-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#232B36" strokeDasharray="3 3" />
          <XAxis dataKey="ts" tickFormatter={fmt} stroke="#94A3B8" tick={{ fontSize: 11 }} minTickGap={48} />
          <YAxis domain={['dataMin - 2', 'dataMax + 2']} stroke="#94A3B8" tick={{ fontSize: 11 }} width={36} />
          <Tooltip
            labelFormatter={(t) => new Date(t).toLocaleTimeString()}
            contentStyle={{ background: '#161A22', border: '1px solid #232B36', borderRadius: 4 }}
            itemStyle={{ color: '#F8FAFC' }}
          />
          <ReferenceArea y1={low} y2={high} fill="#1D9E75" fillOpacity={0.08} stroke="#1D9E75" strokeOpacity={0.25} />
          <Line type="monotone" dataKey="temp" stroke="#3B8BD4" strokeWidth={2} dot={false} isAnimationActive />
          {excursions.map((e, i) => (
            <ReferenceDot key={i} x={e.ts} y={e.temp} r={4} fill="#E24B4A" stroke="#E24B4A" />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
