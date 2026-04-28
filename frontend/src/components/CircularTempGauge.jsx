import React from 'react';
import { tempColor } from '../lib/vaccines';

export default function CircularTempGauge({ tempC, low = 2, high = 8, min = -10, max = 30 }) {
  const c = tempColor(tempC, low, high);
  const pct = Math.max(0, Math.min(1, (tempC - min) / (max - min)));
  const radius = 92;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - pct * 0.75); // 270° arc
  const rotation = -135;

  return (
    <div className="relative w-full aspect-square max-w-[280px] mx-auto" data-testid="temp-gauge">
      <svg viewBox="-120 -120 240 240" className="w-full h-full" style={{ transform: `rotate(${rotation}deg)` }}>
        <circle r={radius} fill="none" stroke="#232B36" strokeWidth="14" strokeDasharray={`${circ * 0.75} ${circ}`} strokeLinecap="round" />
        <circle r={radius} fill="none" stroke={c} strokeWidth="14"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms ease, stroke 300ms ease' }}
        />
        {/* tick marks */}
        {Array.from({ length: 9 }).map((_, i) => {
          const a = (i / 8) * 0.75 * 2 * Math.PI;
          const x1 = Math.cos(a) * (radius - 22);
          const y1 = Math.sin(a) * (radius - 22);
          const x2 = Math.cos(a) * (radius - 14);
          const y2 = Math.sin(a) * (radius - 14);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94A3B8" strokeWidth="1.5" opacity="0.4" />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
        <div className="vx-label mb-1">CHAMBER</div>
        <div className="vx-metric text-5xl md:text-6xl tabular-nums" style={{ color: c }}>
          {Number.isFinite(tempC) ? tempC.toFixed(2) : '—'}
        </div>
        <div className="text-xs vx-mono mt-1" style={{ color: 'var(--vx-text-dim)' }}>°C · SAFE {low}–{high}°C</div>
      </div>
    </div>
  );
}
