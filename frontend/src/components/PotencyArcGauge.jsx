import React from 'react';
import { potencyColor } from '../lib/vaccines';

export default function PotencyArcGauge({ pct, threshold = 80 }) {
  const value = Math.max(0, Math.min(100, pct ?? 0));
  const c = potencyColor(value, threshold);
  const r = 80;
  const arc = Math.PI * r; // half-circle
  const offset = arc * (1 - value / 100);

  return (
    <div className="w-full" data-testid="potency-gauge">
      <svg viewBox="-100 -100 200 110" className="w-full">
        <defs>
          <linearGradient id="potency-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#E24B4A" />
            <stop offset="50%" stopColor="#EF9F27" />
            <stop offset="100%" stopColor="#1D9E75" />
          </linearGradient>
        </defs>
        <path d={`M -${r} 0 A ${r} ${r} 0 0 1 ${r} 0`} fill="none" stroke="#232B36" strokeWidth="14" strokeLinecap="round" />
        <path d={`M -${r} 0 A ${r} ${r} 0 0 1 ${r} 0`} fill="none" stroke={c} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={arc} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease, stroke 300ms ease' }}
        />
        {/* threshold tick */}
        {(() => {
          const a = Math.PI - (threshold / 100) * Math.PI;
          const x1 = Math.cos(a) * (r - 12);
          const y1 = -Math.sin(a) * (r - 12);
          const x2 = Math.cos(a) * (r + 6);
          const y2 = -Math.sin(a) * (r + 6);
          return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E24B4A" strokeWidth="2" />;
        })()}
      </svg>
      <div className="-mt-8 flex flex-col items-center">
        <div className="vx-metric text-4xl md:text-5xl tabular-nums" style={{ color: c }}>
          {value.toFixed(1)}<span className="text-xl ml-1">%</span>
        </div>
        <div className="text-xs vx-mono" style={{ color: 'var(--vx-text-dim)' }}>POTENCY · MIN {threshold}%</div>
      </div>
    </div>
  );
}
