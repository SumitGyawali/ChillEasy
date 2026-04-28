import React from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Brain, TrendingUp, AlertTriangle } from 'lucide-react';

export default function MLPanel({ ml, vaccine }) {
  if (!ml) {
    return (
      <div className="vx-card p-5" data-testid="ml-panel">
        <Header />
        <div className="mt-4 flex flex-col items-center justify-center h-32 text-sm" style={{ color: 'var(--vx-text-dim)' }}>
          <Brain size={28} className="mb-2 opacity-50" />
          Awaiting 10 samples + first retrain cycle…
        </div>
      </div>
    );
  }

  const data = ml.fitWindow.map((p) => ({
    x: p.x,
    actual: +p.y.toFixed(2),
    fit: +p.yhat.toFixed(2),
    upper: +(p.yhat + ml.std).toFixed(2),
    lower: +(p.yhat - ml.std).toFixed(2),
  }));
  // forecast point
  data.push({
    x: ml.xTarget,
    fit: +ml.tPred.toFixed(2),
    upper: +(ml.tPred + ml.std).toFixed(2),
    lower: +(ml.tPred - ml.std).toFixed(2),
  });

  const breach = vaccine && ml.predictedPotency < vaccine.min_potency_pct;

  return (
    <div className="vx-card p-5" data-testid="ml-panel">
      <Header updatedAt={ml.updatedAt} mae={ml.mae} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Stat label="T(t+15min)" value={`${ml.tPred.toFixed(2)}°C`} testid="ml-tpred" />
        <Stat label="Potency(t+15)" value={`${ml.predictedPotency.toFixed(1)}%`}
          color={breach ? 'var(--vx-critical)' : 'var(--vx-text)'} testid="ml-ppred" />
        <Stat label="Slope" value={`${(ml.slope * 60).toFixed(2)}°C/h`} testid="ml-slope" />
        <Stat label="Risk" value={`${ml.riskScore}/100`}
          color={ml.riskScore > 70 ? 'var(--vx-critical)' : ml.riskScore > 40 ? 'var(--vx-warning)' : 'var(--vx-success)'}
          testid="ml-risk" />
      </div>

      <div className="h-[180px] mt-4" data-testid="ml-forecast-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#232B36" strokeDasharray="3 3" />
            <XAxis dataKey="x" stroke="#94A3B8" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)}m`} />
            <YAxis stroke="#94A3B8" tick={{ fontSize: 10 }} width={36} />
            <Tooltip contentStyle={{ background: '#161A22', border: '1px solid #232B36', borderRadius: 4 }} itemStyle={{ color: '#F8FAFC' }} />
            <Area type="monotone" dataKey="upper" stroke="none" fill="#3B8BD4" fillOpacity={0.08} isAnimationActive={false} />
            <Area type="monotone" dataKey="lower" stroke="none" fill="#0D0F14" fillOpacity={1} isAnimationActive={false} />
            <Line type="monotone" dataKey="actual" stroke="#94A3B8" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="fit" stroke="#3B8BD4" strokeWidth={2} strokeDasharray="4 3" dot={false} />
            <ReferenceLine x={ml.xLast} stroke="#EF9F27" strokeDasharray="2 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {breach && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded border" style={{ borderColor: 'rgba(226,75,74,0.4)', background: 'rgba(226,75,74,0.08)' }} data-testid="ml-breach-banner">
          <AlertTriangle size={16} style={{ color: 'var(--vx-critical)' }} className="mt-0.5" />
          <div className="text-xs">
            <div style={{ color: 'var(--vx-critical)' }} className="font-medium">ML_BREACH_PREDICTED</div>
            <div style={{ color: 'var(--vx-text-dim)' }}>Forecast potency falls to {ml.predictedPotency.toFixed(1)}% — below {vaccine.min_potency_pct}% threshold within 15 min.</div>
          </div>
        </div>
      )}
      <div className="text-[10px] mt-3 vx-mono" style={{ color: 'var(--vx-text-dim)' }}>
        ESTIMATE · TF.js linear regression (10-pt window) → Arrhenius projection
      </div>
    </div>
  );
}

function Header({ updatedAt, mae }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Brain size={16} style={{ color: 'var(--vx-primary)' }} />
        <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>PREDICTIVE ML</h3>
      </div>
      <div className="flex items-center gap-2">
        {Number.isFinite(mae) && <span className="vx-chip info" data-testid="ml-mae-chip">MAE {mae.toFixed(3)}</span>}
        {updatedAt && <span className="vx-chip" data-testid="ml-updated-chip"><TrendingUp size={11} /> {new Date(updatedAt).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'var(--vx-text)', testid }) {
  return (
    <div className="rounded p-3 border" style={{ borderColor: 'var(--vx-border)', background: 'rgba(13,15,20,0.5)' }} data-testid={testid}>
      <div className="vx-label">{label}</div>
      <div className="vx-metric text-xl mt-1 tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}
