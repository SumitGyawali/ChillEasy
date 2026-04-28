import React, { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useSession } from '../context/SessionContext';
import { QrCode, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Builds a provisioning payload that the NodeMCU's captive-portal scans and persists
 * to non-volatile storage. Schema is intentionally compact to fit a 256x256 QR cleanly.
 *
 * NodeMCU captive-portal flow:
 *   1. On first boot (or after reset), ESP32 starts SoftAP "VaxChain-Setup-XXXX"
 *      and serves a captive portal at 192.168.4.1.
 *   2. Field worker opens the portal, taps "Scan QR", and a JS QR scanner posts the
 *      JSON below to /provision on the device.
 *   3. Firmware writes WiFi creds + broker + topic + token to NVS, restarts.
 *   4. Audit trail: when the device first publishes telemetry, the backend logs a
 *      provisioning event so admins can see who deployed which device when.
 */
function buildPayload({ deviceId, broker, topicPrefix, ingestUrl, wifi, token }) {
  return {
    v: 1,
    d: deviceId,
    b: broker,
    p: topicPrefix,
    i: ingestUrl,
    w: wifi.ssid ? { s: wifi.ssid, p: wifi.password || '' } : undefined,
    t: token || undefined,
    ts: new Date().toISOString(),
  };
}

export default function DeviceDeployQR() {
  const { settings } = useSession();
  const apiBase = process.env.REACT_APP_BACKEND_URL;
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [token, setToken] = useState(() => `vx-${Math.random().toString(36).slice(2, 10)}`);
  const [copied, setCopied] = useState(false);

  const payload = useMemo(() => buildPayload({
    deviceId: settings.device.id,
    broker: settings.mqtt.url,
    topicPrefix: settings.mqtt.topicPrefix,
    ingestUrl: `${apiBase}/api/ingest/${settings.device.id}`,
    wifi: { ssid: wifiSSID, password: wifiPass },
    token,
  }), [settings, apiBase, wifiSSID, wifiPass, token]);

  const json = JSON.stringify(payload);
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
      toast.success('Payload copied');
    } catch { toast.error('Clipboard blocked'); }
  };

  const regenerateToken = () => setToken(`vx-${Math.random().toString(36).slice(2, 10)}`);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button data-testid="device-deploy-btn" className="bg-[#1D9E75] hover:bg-[#188361] text-white rounded-sm">
          <QrCode size={14} className="mr-1.5" /> Deploy device (QR)
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#161A22] border-[#232B36] text-white max-w-xl" data-testid="device-deploy-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Barlow' }}>Deploy NodeMCU · {settings.device.id}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Field label="WiFi SSID">
              <Input data-testid="deploy-wifi-ssid" value={wifiSSID} onChange={(e) => setWifiSSID(e.target.value)} className="bg-[#0D0F14] border-[#232B36] rounded-sm h-9" placeholder="optional" />
            </Field>
            <Field label="WiFi password">
              <Input data-testid="deploy-wifi-pass" type="password" value={wifiPass} onChange={(e) => setWifiPass(e.target.value)} className="bg-[#0D0F14] border-[#232B36] rounded-sm h-9" placeholder="optional" />
            </Field>
            <Field label="Provisioning token">
              <div className="flex gap-2">
                <Input data-testid="deploy-token" value={token} onChange={(e) => setToken(e.target.value)} className="bg-[#0D0F14] border-[#232B36] rounded-sm h-9" />
                <Button data-testid="deploy-token-regen" variant="outline" className="border-[#232B36] hover:bg-[#1E2430] rounded-sm h-9" onClick={regenerateToken}>↻</Button>
              </div>
            </Field>
            <div className="text-[11px] vx-mono leading-relaxed mt-2" style={{ color: 'var(--vx-text-dim)' }}>
              Includes: device ID, MQTT broker, topic prefix, HTTP ingest URL{wifiSSID ? ', WiFi creds' : ''}, token.<br />
              NodeMCU captive portal at <code>192.168.4.1</code> scans and persists to NVS.
            </div>
            <Button data-testid="deploy-copy-json" variant="outline" className="border-[#232B36] hover:bg-[#1E2430] rounded-sm w-full" onClick={copyJson}>
              {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />} Copy JSON payload
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center" data-testid="deploy-qr-canvas">
            <div className="p-3 rounded bg-white">
              <QRCodeSVG value={json} size={220} level="M" includeMargin={false} />
            </div>
            <div className="text-[11px] vx-mono mt-3 text-center" style={{ color: 'var(--vx-text-dim)' }}>
              v{payload.v} · {json.length} bytes
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
