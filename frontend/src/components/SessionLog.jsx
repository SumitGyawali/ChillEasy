import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSession } from '../context/SessionContext';
import { Button } from './ui/button';
import { Download, FileText, Eye } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from 'recharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const head = cols.join(',');
  const body = rows.map((r) => cols.map((c) => {
    const v = r[c];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v).replaceAll(',', ';');
    return String(v).replaceAll(',', ';');
  }).join(',')).join('\n');
  return head + '\n' + body;
}

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function SessionLog() {
  const { session, telemetry, alerts, ml } = useSession();
  const [history, setHistory] = useState([]);
  const [replay, setReplay] = useState(null);

  const reload = () => axios.get(`${API}/sessions`).then((r) => setHistory(r.data)).catch(() => {});
  useEffect(() => { reload(); }, []);

  const exportCSV = () => {
    const rows = telemetry.map((p) => ({
      timestamp: p.t,
      sensor1: p.sensor1,
      sensor2: p.sensor2,
      pwm_pct: p.pwm,
      potency_pct: +p.potency.toFixed(3),
      predicted_potency: ml ? +ml.predictedPotency.toFixed(3) : '',
      lat: p.lat,
      lng: p.lng,
      alert_flags: alerts
        .filter((a) => Math.abs(new Date(a.timestamp) - new Date(p.t)) < 5000)
        .map((a) => a.type).join('|'),
    }));
    download(`vaxchain-session-${session?.id?.slice(0, 8) || 'live'}.csv`, toCSV(rows));
  };

  const openReplay = async (sid) => {
    const [tel, alertList, sess] = await Promise.all([
      axios.get(`${API}/sessions/${sid}/telemetry`).then((r) => r.data).catch(() => []),
      axios.get(`${API}/sessions/${sid}/alerts`).then((r) => r.data).catch(() => []),
      axios.get(`${API}/sessions/${sid}`).then((r) => r.data).catch(() => null),
    ]);
    setReplay({ session: sess, telemetry: tel, alerts: alertList });
  };

  const summary = telemetry.length ? {
    start: telemetry[0]?.t,
    duration: ((new Date(telemetry[telemetry.length - 1].t) - new Date(telemetry[0].t)) / 60000).toFixed(1),
    minTemp: Math.min(...telemetry.map((x) => x.temp)).toFixed(2),
    maxTemp: Math.max(...telemetry.map((x) => x.temp)).toFixed(2),
    finalPotency: telemetry[telemetry.length - 1].potency.toFixed(1),
    breaches: alerts.filter((a) => a.severity === 'critical').length,
  } : null;

  return (
    <div className="space-y-4" data-testid="session-log">
      <div className="vx-card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText size={16} style={{ color: 'var(--vx-primary)' }} />
            <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>CURRENT SESSION</h3>
          </div>
          <Button data-testid="export-csv-btn" disabled={!telemetry.length} onClick={exportCSV} className="bg-[#3B8BD4] hover:bg-[#2A75B8] text-white rounded-sm">
            <Download size={14} className="mr-1.5" /> Export CSV
          </Button>
        </div>
        {summary ? (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
            {[
              ['Start', new Date(summary.start).toLocaleTimeString()],
              ['Duration', `${summary.duration} min`],
              ['Min temp', `${summary.minTemp}°C`],
              ['Max temp', `${summary.maxTemp}°C`],
              ['Final potency', `${summary.finalPotency}%`],
              ['Breaches', summary.breaches],
            ].map(([k, v]) => (
              <div key={k} className="rounded p-2 border" style={{ borderColor: 'var(--vx-border)' }}>
                <div className="vx-label">{k}</div>
                <div className="vx-metric text-base mt-0.5 tabular-nums">{v}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm mt-3" style={{ color: 'var(--vx-text-dim)' }}>No active session telemetry.</div>
        )}
      </div>

      <div className="vx-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>HISTORICAL SESSIONS</h3>
          <Button data-testid="reload-history-btn" variant="outline" size="sm" onClick={reload}
            className="border-[#232B36] hover:bg-[#1E2430] rounded-sm">Reload</Button>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm" data-testid="history-table">
            <thead>
              <tr className="text-left vx-label">
                <th className="pb-2">Started</th>
                <th className="pb-2">Vaccine</th>
                <th className="pb-2">Setpoint</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: 'var(--vx-border)' }} data-testid={`history-row-${s.id}`}>
                  <td className="py-2 vx-mono text-xs">{new Date(s.started_at).toLocaleString()}</td>
                  <td className="py-2">{s.vaccine_name}</td>
                  <td className="py-2 vx-mono text-xs">{s.setpoint_c}°C</td>
                  <td className="py-2">{s.ended_at ? <span className="vx-chip">ended</span> : <span className="vx-chip ok">active</span>}</td>
                  <td className="py-2 text-right">
                    <Button data-testid={`replay-${s.id}`} size="sm" variant="ghost" onClick={() => openReplay(s.id)}>
                      <Eye size={14} className="mr-1" /> Replay
                    </Button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-sm" style={{ color: 'var(--vx-text-dim)' }}>No sessions yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {replay && (
        <div className="vx-card p-5" data-testid="replay-panel">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>REPLAY · {replay.session?.vaccine_name}</h3>
            <Button data-testid="replay-close-btn" size="sm" variant="ghost" onClick={() => setReplay(null)}>Close</Button>
          </div>
          <div className="h-[260px] mt-3">
            <ResponsiveContainer>
              <LineChart data={replay.telemetry.map((p) => ({ ts: new Date(p.timestamp).getTime(), temp: (p.sensor1 + p.sensor2) / 2 }))}>
                <CartesianGrid stroke="#232B36" strokeDasharray="3 3" />
                <XAxis dataKey="ts" stroke="#94A3B8" tick={{ fontSize: 10 }} tickFormatter={(t) => new Date(t).toLocaleTimeString()} />
                <YAxis stroke="#94A3B8" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#161A22', border: '1px solid #232B36' }} />
                <ReferenceArea y1={2} y2={8} fill="#1D9E75" fillOpacity={0.08} />
                <Line dataKey="temp" stroke="#3B8BD4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--vx-text-dim)' }}>{replay.telemetry.length} points · {replay.alerts.length} alerts</div>
        </div>
      )}
    </div>
  );
}
