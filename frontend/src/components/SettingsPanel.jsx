import React from 'react';
import { useSession } from '../context/SessionContext';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Settings as SettingsIcon, Zap, Cloud, Radio, Send } from 'lucide-react';
import DeviceDeployQR from './DeviceDeployQR';

function DeviceLinkCard() {
  const { settings, sendCommand, linkStatus, running } = useSession();
  const [setpoint, setSetpoint] = React.useState(settings.setpointC);

  const dotClass = linkStatus.status === 'connected' ? '' : linkStatus.status === 'error' || linkStatus.status === 'closed' ? 'crit' : 'warn';

  return (
    <div className="vx-card p-5" data-testid="device-link-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Radio size={16} style={{ color: 'var(--vx-primary)' }} />
          <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>NODEMCU DEVICE LINK</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="vx-chip" data-testid="device-link-status">
            <span className={`vx-pulse-dot ${dotClass}`} />
            {(linkStatus.status || 'idle').toUpperCase()}
            {linkStatus.broker ? ` · ${linkStatus.broker.split('://')[1]}` : ''}
          </span>
          <DeviceDeployQR />
        </div>
      </div>
      <div className="text-xs mt-2" style={{ color: 'var(--vx-text-dim)' }}>
        {settings.source === 'mqtt' && 'Subscribed to telemetry topic; commands published over WebSocket.'}
        {settings.source === 'http' && 'Polling backend ingest endpoint; commands queued for NodeMCU long-poll.'}
        {settings.source === 'simulator' && 'Simulator mode — start a session in MQTT, HTTP, or Firebase mode to talk to a real NodeMCU.'}
        {settings.source === 'firebase' && 'Firebase Realtime DB mode — subscribed to devices/{id}/telemetry/live; commands pushed to devices/{id}/cmd.'}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <div className="rounded p-3 border" style={{ borderColor: 'var(--vx-border)' }}>
          <div className="vx-label">Send setpoint</div>
          <div className="flex gap-2 mt-2">
            <Input data-testid="cmd-setpoint-input" type="number" step={0.5} value={setpoint} onChange={(e) => setSetpoint(+e.target.value)} className="bg-[#0D0F14] border-[#232B36] rounded-sm h-9" />
            <Button data-testid="cmd-setpoint-btn" onClick={() => sendCommand('setpoint', setpoint)} disabled={!running} className="bg-[#3B8BD4] hover:bg-[#2A75B8] text-white rounded-sm h-9">
              <Send size={14} />
            </Button>
          </div>
        </div>
        <div className="rounded p-3 border" style={{ borderColor: 'var(--vx-border)' }}>
          <div className="vx-label">Command</div>
          <Button data-testid="cmd-excursion-btn" onClick={() => sendCommand('excursion_test')} disabled={!running}
            className="mt-2 w-full bg-[#EF9F27] hover:bg-[#d68b1c] text-black rounded-sm h-9">
            Trigger excursion test
          </Button>
        </div>
        <div className="rounded p-3 border" style={{ borderColor: 'var(--vx-border)' }}>
          <div className="vx-label">Command</div>
          <Button data-testid="cmd-reset-btn" onClick={() => sendCommand('reset')} disabled={!running} variant="outline"
            className="mt-2 w-full border-[#232B36] hover:bg-[#1E2430] rounded-sm h-9">
            Reset device
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  const { settings, persistSettings, triggerExcursion, running } = useSession();

  const update = (patch) => persistSettings({ ...settings, ...patch });
  const updateNested = (key, patch) => persistSettings({ ...settings, [key]: { ...settings[key], ...patch } });

  return (
    <div className="space-y-6" data-testid="settings-panel">
      <DeviceLinkCard />

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
                <SelectItem value="mqtt">MQTT (NodeMCU live)</SelectItem>
                <SelectItem value="http">HTTP (NodeMCU REST)</SelectItem>
                <SelectItem value="firebase">Firebase Realtime DB</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Device ID">
            <Input data-testid="settings-device-id" value={settings.device.id} onChange={(e) => updateNested('device', { id: e.target.value })} className="bg-[#0D0F14] border-[#232B36] rounded-sm" />
          </Field>
          <Field label="MQTT broker (WSS)">
            <Input data-testid="settings-mqtt-url" value={settings.mqtt.url} onChange={(e) => updateNested('mqtt', { url: e.target.value })} className="bg-[#0D0F14] border-[#232B36] rounded-sm" />
          </Field>
          <Field label="MQTT topic prefix">
            <Input data-testid="settings-mqtt-topic" value={settings.mqtt.topicPrefix} onChange={(e) => updateNested('mqtt', { topicPrefix: e.target.value })} className="bg-[#0D0F14] border-[#232B36] rounded-sm" />
          </Field>
        </div>
        <div className="text-[11px] vx-mono mt-3 leading-relaxed" style={{ color: 'var(--vx-text-dim)' }}>
          <div>MQTT topics: <code>{settings.mqtt.topicPrefix}/{settings.device.id}/telemetry</code> (NodeMCU → UI), <code>{settings.mqtt.topicPrefix}/{settings.device.id}/cmd</code> (UI → NodeMCU)</div>
          <div>HTTP endpoints: <code>POST /api/ingest/{settings.device.id}</code>, <code>GET /api/devices/{settings.device.id}/commands</code> (NodeMCU long-poll)</div>
          <div>Reference firmware: <code>/app/firmware/vaxchain_nodemcu.ino</code></div>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 items-end">
          <NumField label="Dest lat" testid="settings-geo-lat" value={settings.geofence.lat} onChange={(v) => updateNested('geofence', { lat: v })} step={0.0001} />
          <NumField label="Dest lng" testid="settings-geo-lng" value={settings.geofence.lng} onChange={(v) => updateNested('geofence', { lng: v })} step={0.0001} />
          <NumField label="Radius (m)" testid="settings-geo-radius" value={settings.geofence.radiusM} onChange={(v) => updateNested('geofence', { radiusM: v })} />
          <Field label="Enabled">
            <div className="flex items-center h-10">
              <Switch data-testid="settings-geo-enabled" checked={!!settings.geofence.enabled} onCheckedChange={(v) => updateNested('geofence', { enabled: v })} />
              <span className="ml-2 text-xs vx-mono" style={{ color: 'var(--vx-text-dim)' }}>{settings.geofence.enabled ? 'on' : 'off'}</span>
            </div>
          </Field>
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
