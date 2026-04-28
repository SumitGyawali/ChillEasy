import React from 'react';
import { useSession } from '../context/SessionContext';
import CircularTempGauge from '../components/CircularTempGauge';
import TempHistoryChart from '../components/TempHistoryChart';
import { SensorReadout, PIDPanel, BatteryTile, GPSTile, SessionTimer } from '../components/SensorAndPID';
import PotencyEngine from '../components/PotencyEngine';
import MLPanel from '../components/MLPanel';
import AlertCenter from '../components/AlertCenter';

export default function Dashboard() {
  const { latest, telemetry, alerts, settings, session, running, activeVaccine, ml } = useSession();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-medium tracking-tighter" style={{ fontFamily: 'Barlow' }}>Live Monitor</h1>
          <div className="text-sm mt-1" style={{ color: 'var(--vx-text-dim)' }}>
            Cold-chain instrument panel · {activeVaccine?.name || 'select vaccine'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="vx-chip"><span className={`vx-pulse-dot ${running ? '' : 'crit'}`} /> {settings.source.toUpperCase()}</span>
          <span className="vx-chip info">{telemetry.length} samples</span>
        </div>
      </div>

      {/* Hero gauge + sensor + PID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="vx-card p-6 lg:col-span-1 relative overflow-hidden" data-testid="hero-gauge">
          <div className="absolute inset-0 vx-grid-bg" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="vx-label">CHAMBER TEMPERATURE</div>
              <span className="vx-chip"><span className="vx-pulse-dot" /> LIVE</span>
            </div>
            <CircularTempGauge tempC={latest?.temp ?? settings.setpointC} low={settings.thresholds.tempLow} high={settings.thresholds.tempHigh} />
          </div>
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <SensorReadout s1={latest?.sensor1} s2={latest?.sensor2} />
          <PIDPanel pwm={latest?.pwm} setpoint={settings.setpointC} current={latest?.temp} />
          <BatteryTile pct={latest?.battery ?? 100} />
          <GPSTile lat={latest?.lat} lng={latest?.lng} t={latest?.t} />
        </div>
      </div>

      {/* Timer + history */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SessionTimer startedAt={session?.started_at} running={running} />
        <div className="vx-card p-5 lg:col-span-2" data-testid="temp-history-card">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>TEMPERATURE · LAST 60 MIN</h3>
            <span className="vx-chip"><span className="vx-pulse-dot" /> STREAM</span>
          </div>
          <div className="mt-3"><TempHistoryChart telemetry={telemetry} low={settings.thresholds.tempLow} high={settings.thresholds.tempHigh} alerts={alerts} /></div>
        </div>
      </div>

      {/* Potency + ML */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2"><PotencyEngine /></div>
        <div className="xl:col-span-1"><MLPanel ml={ml} vaccine={activeVaccine} /></div>
      </div>

      {/* Alerts feed (last 5) */}
      <AlertCenter compact max={5} />
    </div>
  );
}
