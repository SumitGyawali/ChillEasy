import React from 'react';
import { useSession } from '../context/SessionContext';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Settings as SettingsIcon, Zap, Cloud } from 'lucide-react';

export default function SettingsPanel() {
  const { settings, persistSettings, triggerExcursion, running } = useSession();

  const update = (patch) => persistSettings({ ...settings, ...patch });
  const updateNested = (key, patch) => persistSettings({ ...settings, [key]: { ...settings[key], ...patch } });

  return (
    <div className="space-y-6" data-testid="settings-panel">
      <div className="vx-card p-5">
        <div className="flex items-center gap-2"><Cloud size={16} style={{ color: 'var(--vx-primary)' }} />
          <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>DATA SOURCE</h3>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-4">
          <Field label="Mode">
            <Select value={settings.source} onValueChange={(v) => update({ source: v })}>
              <SelectTrigger className="bg-[#0D0F14] border-[#232B36] rounded-sm" data-testid="settings-source"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#161A22] border-[#232B36] text-white">
                <SelectItem value="simulator">Simulator</SelectItem>
                <SelectItem value="mqtt">MQTT Live</SelectItem>
                <SelectItem value="firebase">Firebase (configure)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="MQTT URL">
            <Input data-testid="settings-mqtt-url" value={settings.mqtt.url} onChange={(e) => updateNested('mqtt', { url: e.target.value })} className="bg-[#0D0F14] border-[#232B36] rounded-sm" />
          </Field>
          <Field label="Topic prefix">
            <Input data-testid="settings-mqtt-topic" value={settings.mqtt.topic} onChange={(e) => updateNested('mqtt', { topic: e.target.value })} className="bg-[#0D0F14] border-[#232B36] rounded-sm" />
          </Field>
        </div>
        <div className="text-[11px] vx-mono mt-2" style={{ color: 'var(--vx-text-dim)' }}>
          Tip: Firebase config slot (apiKey, projectId, databaseURL) is reserved — wire your config in <code className="vx-mono">src/lib/dataSource.js</code> ➜ <code>FirebaseAdapter</code> when ready.
        </div>
      </div>

      <div className="vx-card p-5">
        <div className="flex items-center gap-2">
          <SettingsIcon size={16} style={{ color: 'var(--vx-primary)' }} />
          <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>THRESHOLDS</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <NumField label="Setpoint (°C)" testid="settings-setpoint" value={settings.setpointC} onChange={(v) => update({ setpointC: v })} />
          <NumField label="Temp low" testid="settings-temp-low" value={settings.thresholds.tempLow} onChange={(v) => updateNested('thresholds', { tempLow: v })} />
          <NumField label="Temp high" testid="settings-temp-high" value={settings.thresholds.tempHigh} onChange={(v) => updateNested('thresholds', { tempHigh: v })} />
          <NumField label="Rate °C/min" testid="settings-rate-limit" value={settings.thresholds.rateLimit} onChange={(v) => updateNested('thresholds', { rateLimit: v })} />
          <NumField label="Potency min %" testid="settings-potency-min" value={settings.thresholds.potencyMin} onChange={(v) => updateNested('thresholds', { potencyMin: v })} />
          <NumField label="Battery low %" testid="settings-battery-low" value={settings.thresholds.batteryLow} onChange={(v) => updateNested('thresholds', { batteryLow: v })} />
          <Field label="Unit">
            <Select value={settings.unit} onValueChange={(v) => update({ unit: v })}>
              <SelectTrigger className="bg-[#0D0F14] border-[#232B36] rounded-sm" data-testid="settings-unit"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#161A22] border-[#232B36] text-white">
                <SelectItem value="C">°C</SelectItem>
                <SelectItem value="F">°F</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <NumField label="ML retrain (min)" testid="settings-ml-interval" value={settings.mlIntervalMin} onChange={(v) => update({ mlIntervalMin: v })} />
        </div>
      </div>

      <div className="vx-card p-5">
        <div className="flex items-center gap-2">
          <SettingsIcon size={16} style={{ color: 'var(--vx-primary)' }} />
          <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>GEOFENCE</h3>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <NumField label="Dest lat" testid="settings-geo-lat" value={settings.geofence.lat} onChange={(v) => updateNested('geofence', { lat: v })} step={0.0001} />
          <NumField label="Dest lng" testid="settings-geo-lng" value={settings.geofence.lng} onChange={(v) => updateNested('geofence', { lng: v })} step={0.0001} />
          <NumField label="Radius (m)" testid="settings-geo-radius" value={settings.geofence.radiusM} onChange={(v) => updateNested('geofence', { radiusM: v })} />
        </div>
      </div>

      <div className="vx-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Zap size={16} style={{ color: 'var(--vx-warning)' }} />
              <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>DEMO TOOLS</h3>
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--vx-text-dim)' }}>Inject a thermal excursion to demo alerts, potency loss, and ML breach prediction.</div>
          </div>
          <Button data-testid="trigger-excursion-btn" disabled={!running} onClick={triggerExcursion}
            className="bg-[#EF9F27] hover:bg-[#d68b1c] text-black rounded-sm">
            Inject thermal excursion
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="vx-label">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function NumField({ label, value, onChange, testid, step = 1 }) {
  return (
    <Field label={label}>
      <Input data-testid={testid} type="number" step={step} value={value} onChange={(e) => onChange(+e.target.value)}
        className="bg-[#0D0F14] border-[#232B36] rounded-sm" />
    </Field>
  );
}
