import React from 'react';
import { useSession } from '../context/SessionContext';
import { AlertTriangle, X, BellRing } from 'lucide-react';
import { Button } from './ui/button';

const TYPE_LABEL = {
  TEMP_HIGH: 'Temperature High',
  TEMP_LOW: 'Temperature Low',
  TEMP_RISING_FAST: 'Rising Fast',
  SENSOR_FAULT: 'Sensor Fault',
  POTENCY_CRITICAL: 'Potency Critical',
  BATTERY_LOW: 'Battery Low',
  COOLING_FAULT: 'Cooling Fault',
  ML_BREACH_PREDICTED: 'ML Breach Predicted',
  GEOFENCE_EXIT: 'Geofence Exit',
};

export default function AlertCenter({ compact = false, max = null }) {
  const { alerts, dismissAlert } = useSession();
  const list = (alerts || []).filter((a) => !a.dismissed);
  const shown = max ? list.slice(0, max) : list;

  return (
    <div className="vx-card p-4" data-testid="alert-center">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing size={14} style={{ color: 'var(--vx-warning)' }} />
          <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>ALERT CENTRE</h3>
        </div>
        <span className="vx-chip" data-testid="alert-count-chip">{list.length} active</span>
      </div>
      {shown.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--vx-text-dim)' }} data-testid="alerts-empty">
          All systems nominal.
        </div>
      ) : (
        <ul className="mt-3 space-y-2 max-h-[420px] overflow-auto pr-1">
          {shown.map((a) => (
            <li key={a.id}
              className="flex items-start gap-3 p-3 rounded border"
              style={{
                borderColor: a.severity === 'critical' ? 'rgba(226,75,74,0.45)'
                  : a.severity === 'warning' ? 'rgba(239,159,39,0.45)'
                  : 'var(--vx-border)',
                background: a.severity === 'critical' ? 'rgba(226,75,74,0.06)' : 'rgba(13,15,20,0.4)',
              }}
              data-testid={`alert-item-${a.type}`}
            >
              <AlertTriangle size={16} className="mt-0.5"
                style={{ color: a.severity === 'critical' ? 'var(--vx-critical)' : a.severity === 'warning' ? 'var(--vx-warning)' : 'var(--vx-primary)' }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`vx-chip ${a.severity === 'critical' ? 'crit' : a.severity === 'warning' ? 'warn' : 'info'}`}>
                    {a.type}
                  </span>
                  <span className="text-[11px] vx-mono" style={{ color: 'var(--vx-text-dim)' }}>
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {!compact && <div className="text-sm mt-1">{a.message}</div>}
                {compact && <div className="text-xs mt-0.5" style={{ color: 'var(--vx-text-dim)' }}>{TYPE_LABEL[a.type] || a.type}</div>}
              </div>
              <Button data-testid={`alert-dismiss-${a.id}`} variant="ghost" size="sm" onClick={() => dismissAlert(a.id)} className="h-7 w-7 p-0 text-[#94A3B8] hover:text-white">
                <X size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
