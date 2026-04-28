import React, { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useSession } from '../context/SessionContext';
import { arrheniusK, viabilityHours } from '../lib/vaccines';
import PotencyArcGauge from './PotencyArcGauge';
import { AlertTriangle, FlaskConical } from 'lucide-react';

export default function PotencyEngine() {
  const { vaccines, vaccineId, setVaccineId, customVaccine, setCustomVaccine, activeVaccine, telemetry, latest, exposure, viability } = useSession();
  const [showCustom, setShowCustom] = useState(false);

  const onSelect = (val) => {
    setVaccineId(val);
    setShowCustom(val === 'custom');
    if (val === 'custom' && !customVaccine) {
      setCustomVaccine({ id: 'custom', name: 'Custom Vaccine', platform: 'Custom', k_safe: 0.002, k_hot: 0.06, Ea_kJ_mol: 90, min_potency_pct: 80 });
    }
  };

  // Build potency series from real telemetry (history) + forward projection at current temp
  const series = telemetry.slice(-200).map((p, i) => ({
    minute: i === 0 ? 0 : (new Date(p.t) - new Date(telemetry[Math.max(0, telemetry.length - 200)].t)) / 60000,
    actual: +p.potency.toFixed(2),
    proj: null,
  }));

  if (latest && activeVaccine) {
    const k = arrheniusK(latest.temp, activeVaccine);
    const lastMin = series.length ? series[series.length - 1].minute : 0;
    for (let i = 1; i <= 24; i++) {
      const m = lastMin + i * 30; // 30-min steps over 12h projection
      const dtH = (m - lastMin) / 60;
      const proj = latest.potency * Math.exp(-k * dtH);
      series.push({ minute: m, actual: null, proj: +proj.toFixed(2) });
    }
  }

  const breach = latest && activeVaccine && latest.potency < activeVaccine.min_potency_pct;
  const breachAlert = breach ? new Date(latest.t).toLocaleTimeString() : null;

  return (
    <div className="vx-card p-5" data-testid="potency-engine">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} style={{ color: 'var(--vx-primary)' }} />
          <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>VACCINE POTENCY ENGINE</h3>
        </div>
        <Select value={vaccineId} onValueChange={onSelect}>
          <SelectTrigger className="w-[220px] bg-[#0D0F14] border-[#232B36] rounded-sm text-sm" data-testid="vaccine-selector">
            <SelectValue placeholder="Choose vaccine" />
          </SelectTrigger>
          <SelectContent className="bg-[#161A22] border-[#232B36] text-white">
            {vaccines.map((v) => (
              <SelectItem key={v.id} value={v.id} data-testid={`vaccine-opt-${v.id}`}>{v.name}</SelectItem>
            ))}
            <SelectItem value="custom" data-testid="vaccine-opt-custom">Custom vaccine…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showCustom && customVaccine && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2 p-3 rounded border" style={{ borderColor: 'var(--vx-border)' }} data-testid="custom-vaccine-form">
          {[
            ['name', 'Name'], ['k_safe', 'k_safe'], ['k_hot', 'k_hot'], ['Ea_kJ_mol', 'Ea (kJ/mol)'], ['min_potency_pct', 'Min %'],
          ].map(([key, lab]) => (
            <div key={key}>
              <Label className="vx-label">{lab}</Label>
              <Input
                data-testid={`custom-${key}`}
                value={customVaccine[key]}
                onChange={(e) => setCustomVaccine({ ...customVaccine, [key]: key === 'name' ? e.target.value : +e.target.value })}
                className="bg-[#0D0F14] border-[#232B36] rounded-sm h-8 text-sm mt-1"
              />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div className="md:col-span-1">
          <PotencyArcGauge pct={latest?.potency ?? 100} threshold={activeVaccine?.min_potency_pct ?? 80} />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Stat label="Viable for" value={viability ? `${viability.toFixed(1)}h` : '—'} testid="viability-window" />
            <Stat label="Σ Exposure" value={`${exposure.toFixed(0)} °C·min`} testid="cumulative-exposure" />
          </div>
        </div>
        <div className="md:col-span-2 h-[230px]" data-testid="potency-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#232B36" strokeDasharray="3 3" />
              <XAxis dataKey="minute" stroke="#94A3B8" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v)}m`} />
              <YAxis domain={[0, 100]} stroke="#94A3B8" tick={{ fontSize: 10 }} width={32} />
              <Tooltip contentStyle={{ background: '#161A22', border: '1px solid #232B36', borderRadius: 4 }} itemStyle={{ color: '#F8FAFC' }} />
              <ReferenceLine y={activeVaccine?.min_potency_pct ?? 80} stroke="#E24B4A" strokeDasharray="3 3" label={{ value: 'min', fill: '#E24B4A', fontSize: 10 }} />
              <Line type="monotone" dataKey="actual" stroke="#1D9E75" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="proj" stroke="#3B8BD4" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {breach && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded border" style={{ borderColor: 'rgba(226,75,74,0.4)', background: 'rgba(226,75,74,0.08)' }} data-testid="potency-breach-banner">
          <AlertTriangle size={16} style={{ color: 'var(--vx-critical)' }} className="mt-0.5" />
          <div className="text-xs">
            <div style={{ color: 'var(--vx-critical)' }} className="font-medium">POTENCY_CRITICAL · {breachAlert}</div>
            <div style={{ color: 'var(--vx-text-dim)' }}>Current potency {latest.potency.toFixed(1)}% is below {activeVaccine.min_potency_pct}%. Locate nearest cooling unit immediately.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, testid }) {
  return (
    <div className="rounded p-2 border" style={{ borderColor: 'var(--vx-border)', background: 'rgba(13,15,20,0.5)' }} data-testid={testid}>
      <div className="vx-label">{label}</div>
      <div className="vx-metric text-base mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
