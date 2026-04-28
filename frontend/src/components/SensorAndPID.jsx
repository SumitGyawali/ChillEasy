import React from 'react';
import { Activity, Zap, Battery, MapPin, Clock } from 'lucide-react';

function Tile({ label, value, sub, color, testid, icon }) {
  return (
    <div className="vx-card p-4 flex flex-col" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="vx-label">{label}</div>
        {icon}
      </div>
      <div className="vx-metric text-2xl md:text-3xl mt-2 tabular-nums" style={{ color: color || 'var(--vx-text)' }}>{value}</div>
      {sub && <div className="text-[11px] vx-mono mt-1" style={{ color: 'var(--vx-text-dim)' }}>{sub}</div>}
    </div>
  );
}

export function SensorReadout({ s1, s2 }) {
  const div = Math.abs((s1 ?? 0) - (s2 ?? 0));
  const fault = div > 1.0;
  return (
    <div className="vx-card p-4" data-testid="sensor-readout">
      <div className="flex items-center justify-between">
        <div className="vx-label flex items-center gap-2"><Activity size={12} /> DUAL SENSOR</div>
        <span className={`vx-chip ${fault ? 'crit' : 'ok'}`} data-testid="sensor-fault-chip">
          <span className={`vx-pulse-dot ${fault ? 'crit' : ''}`} /> {fault ? 'FAULT' : 'OK'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-3">
        <div>
          <div className="text-[10px] vx-mono" style={{ color: 'var(--vx-text-dim)' }}>SENSOR 1</div>
          <div className="vx-metric text-2xl tabular-nums" data-testid="sensor1">{Number.isFinite(s1) ? s1.toFixed(2) : '—'}°</div>
        </div>
        <div>
          <div className="text-[10px] vx-mono" style={{ color: 'var(--vx-text-dim)' }}>SENSOR 2</div>
          <div className="vx-metric text-2xl tabular-nums" data-testid="sensor2">{Number.isFinite(s2) ? s2.toFixed(2) : '—'}°</div>
        </div>
      </div>
      <div className="text-[11px] vx-mono mt-3" style={{ color: fault ? 'var(--vx-critical)' : 'var(--vx-text-dim)' }}>
        Δ {div.toFixed(2)}°C · threshold 1.00°C
      </div>
    </div>
  );
}

export function PIDPanel({ pwm, setpoint, current }) {
  const error = (current ?? setpoint) - setpoint;
  let state = 'STABLE';
  let chipClass = 'ok';
  if (pwm > 85 && Math.abs(error) > 0.5) { state = 'COOLING'; chipClass = 'info'; }
  if (pwm > 95 && error > 1) { state = 'FAULT'; chipClass = 'crit'; }

  return (
    <div className="vx-card p-4" data-testid="pid-panel">
      <div className="flex items-center justify-between">
        <div className="vx-label flex items-center gap-2"><Zap size={12} /> PID COOLING</div>
        <span className={`vx-chip ${chipClass}`} data-testid="pid-state-chip">{state}</span>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <div className="vx-metric text-3xl tabular-nums" data-testid="pid-pwm">{(pwm ?? 0).toFixed(0)}<span className="text-base ml-1">%</span></div>
          <div className="text-[11px] vx-mono" style={{ color: 'var(--vx-text-dim)' }}>PWM DUTY</div>
        </div>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: '#232B36' }}>
          <div style={{ width: `${pwm ?? 0}%`, background: 'var(--vx-primary)', transition: 'width 500ms ease' }} className="h-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] vx-mono">
          <div><span style={{ color: 'var(--vx-text-dim)' }}>SETPT</span> <span className="ml-2 tabular-nums">{setpoint.toFixed(1)}°C</span></div>
          <div><span style={{ color: 'var(--vx-text-dim)' }}>ACTUAL</span> <span className="ml-2 tabular-nums">{Number.isFinite(current) ? current.toFixed(2) : '—'}°C</span></div>
        </div>
      </div>
    </div>
  );
}

export function BatteryTile({ pct }) {
  const remainingMin = pct ? Math.round((pct / 100) * 480) : 0;
  const power = (15 + (100 - (pct ?? 100)) * 0.05).toFixed(1);
  const color = pct < 20 ? 'var(--vx-critical)' : pct < 40 ? 'var(--vx-warning)' : 'var(--vx-success)';
  return <Tile testid="battery-tile" icon={<Battery size={14} style={{ color }} />} label="BATTERY"
    value={`${(pct ?? 0).toFixed(0)}%`} color={color}
    sub={`~${Math.floor(remainingMin/60)}h ${remainingMin%60}m · ${power} mW`} />;
}

export function GPSTile({ lat, lng, t }) {
  return <Tile testid="gps-tile" icon={<MapPin size={14} style={{ color: 'var(--vx-primary)' }} />} label="GPS"
    value={lat ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '—'}
    sub={t ? new Date(t).toLocaleTimeString() : 'no fix'} />;
}

export function SessionTimer({ startedAt, running }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = startedAt ? Math.max(0, now - new Date(startedAt).getTime()) : 0;
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  return <Tile testid="session-timer" icon={<Clock size={14} style={{ color: 'var(--vx-primary)' }} />} label="SESSION"
    value={`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}
    sub={running ? 'running' : 'idle'} />;
}
