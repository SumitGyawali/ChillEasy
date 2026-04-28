// Real MQTT.js + HTTP fallback adapters for NodeMCU bidirectional comms.
import mqtt from 'mqtt';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULT_ROUTE = [
  [12.9716, 77.5946], [12.9750, 77.6000], [12.9810, 77.6080],
  [12.9890, 77.6160], [12.9970, 77.6240], [13.0050, 77.6320],
];

function gauss(mu = 0, sigma = 1) {
  const u = 1 - Math.random(); const v = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// =================== Simulator ===================
export class DeviceSimulator {
  constructor({ setpointC = 5, route = DEFAULT_ROUTE, intervalMs = 20000 } = {}) {
    this.setpointC = setpointC;
    this.route = route;
    this.intervalMs = intervalMs;
    this._listeners = new Set();
    this._statusListeners = new Set();
    this._timer = null;
    this._t = 0;
    this._battery = 100;
    this._pwm = 25;
    this._currentTemp = setpointC;
    this._excursionRemaining = 0;
    this._excursionPeak = 5;
    this._segIdx = 0;
    this._segProgress = 0;
  }
  on(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  onStatus(cb) { this._statusListeners.add(cb); cb({ status: 'simulator', online: true }); return () => this._statusListeners.delete(cb); }
  setSetpoint(s) { this.setpointC = s; }
  triggerExcursion(durationMin = 5, peakDeltaC = 10) {
    this._excursionRemaining = Math.ceil((durationMin * 60 * 1000) / this.intervalMs);
    this._excursionPeak = peakDeltaC;
  }
  publishCommand() { /* no-op for simulator */ }
  _nextGPS() {
    if (this._segIdx >= this.route.length - 1) { this._segIdx = 0; this._segProgress = 0; }
    const a = this.route[this._segIdx], b = this.route[this._segIdx + 1];
    this._segProgress += 0.04 + Math.random() * 0.02;
    if (this._segProgress >= 1) { this._segProgress = 0; this._segIdx++; }
    const p = Math.min(this._segProgress, 1);
    return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
  }
  _nextTemp() {
    let target = this.setpointC;
    if (this._excursionRemaining > 0) {
      const totalSteps = Math.max(1, Math.ceil((5 * 60 * 1000) / this.intervalMs));
      const phase = 1 - this._excursionRemaining / totalSteps;
      const envelope = Math.sin(Math.max(0, Math.min(1, phase)) * Math.PI);
      target = this.setpointC + this._excursionPeak * envelope;
      this._excursionRemaining--;
    }
    this._currentTemp += (target - this._currentTemp) * 0.35 + gauss(0, 0.15);
    const error = this._currentTemp - this.setpointC;
    this._pwm = Math.max(0, Math.min(100, 25 + error * 12 + gauss(0, 1.5)));
    return this._currentTemp;
  }
  _emit() {
    const t = this._nextTemp();
    const sensor1 = +(t + gauss(0, 0.05)).toFixed(2);
    const sensor2 = +(t + gauss(0, 0.05)).toFixed(2);
    const faultInjection = this._t > 50 && Math.random() < 0.005;
    const s2 = faultInjection ? +(sensor2 + 1.6).toFixed(2) : sensor2;
    const [lat, lng] = this._nextGPS();
    this._battery = Math.max(0, this._battery - 0.05 - Math.random() * 0.02);
    const point = {
      sensor1, sensor2: s2,
      pwm_pct: +this._pwm.toFixed(1),
      battery_pct: +this._battery.toFixed(1),
      lat: +lat.toFixed(6), lng: +lng.toFixed(6),
      timestamp: new Date().toISOString(),
    };
    this._t++;
    this._listeners.forEach((cb) => cb(point));
  }
  start() {
    if (this._timer) return;
    this._emit();
    this._timer = setInterval(() => this._emit(), this.intervalMs);
  }
  stop() { if (this._timer) clearInterval(this._timer); this._timer = null; }
}

// =================== MQTT (real) ===================
// Connects to broker via WebSocket. NodeMCU publishes to `${topicPrefix}/${deviceId}/telemetry`.
// We publish commands to `${topicPrefix}/${deviceId}/cmd`.
export class MQTTService {
  constructor({
    url = 'wss://broker.hivemq.com:8884/mqtt',
    topicPrefix = 'vaxchain',
    deviceId = 'vx-001',
  } = {}) {
    this.url = url;
    this.topicPrefix = topicPrefix;
    this.deviceId = deviceId;
    this._listeners = new Set();
    this._statusListeners = new Set();
    this._client = null;
    this._status = { status: 'disconnected', online: false };
  }
  on(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  onStatus(cb) { this._statusListeners.add(cb); cb(this._status); return () => this._statusListeners.delete(cb); }
  _setStatus(s) { this._status = s; this._statusListeners.forEach((cb) => cb(s)); }

  start() {
    if (this._client) return;
    this._setStatus({ status: 'connecting', online: false });
    const opts = {
      reconnectPeriod: 4000,
      connectTimeout: 8000,
      clean: true,
      clientId: `vaxchain-ui-${Math.random().toString(16).slice(2, 8)}`,
    };
    this._client = mqtt.connect(this.url, opts);
    const telemetryTopic = `${this.topicPrefix}/${this.deviceId}/telemetry`;
    this._client.on('connect', () => {
      this._setStatus({ status: 'connected', online: true, broker: this.url, topic: telemetryTopic });
      this._client.subscribe(telemetryTopic, { qos: 0 });
    });
    this._client.on('reconnect', () => this._setStatus({ status: 'reconnecting', online: false }));
    this._client.on('close', () => this._setStatus({ status: 'closed', online: false }));
    this._client.on('error', (err) => this._setStatus({ status: 'error', online: false, error: String(err?.message || err) }));
    this._client.on('message', (_topic, msg) => {
      try {
        const obj = JSON.parse(msg.toString());
        // Validate minimal schema; NodeMCU must match.
        if (Number.isFinite(obj.sensor1) && Number.isFinite(obj.sensor2)) {
          if (!obj.timestamp) obj.timestamp = new Date().toISOString();
          this._listeners.forEach((cb) => cb(obj));
        }
      } catch (e) { /* swallow malformed */ }
    });
  }

  /** Publish a command for the NodeMCU. */
  publishCommand(type, value = null) {
    if (!this._client || !this._client.connected) return false;
    const topic = `${this.topicPrefix}/${this.deviceId}/cmd`;
    this._client.publish(topic, JSON.stringify({ type, value, ts: new Date().toISOString() }), { qos: 0 });
    return true;
  }

  triggerExcursion() { this.publishCommand('excursion_test'); }
  setSetpoint(v) { this.publishCommand('setpoint', v); }

  stop() {
    if (this._client) {
      try { this._client.end(true); } catch (e) {}
      this._client = null;
    }
    this._setStatus({ status: 'disconnected', online: false });
  }
}

// =================== HTTP polling adapter (fallback for NodeMCU using REST) ===================
// NodeMCU posts telemetry to `${API}/ingest/{deviceId}`.
// Browser polls `${API}/devices/{deviceId}/telemetry` for new points.
// Browser enqueues commands via `${API}/devices/{deviceId}/commands`; NodeMCU polls them.
export class HTTPDeviceAdapter {
  constructor({ deviceId = 'vx-001', pollMs = 4000 } = {}) {
    this.deviceId = deviceId;
    this.pollMs = pollMs;
    this._listeners = new Set();
    this._statusListeners = new Set();
    this._timer = null;
    this._lastTs = 0;
    this._status = { status: 'idle', online: false };
  }
  on(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  onStatus(cb) { this._statusListeners.add(cb); cb(this._status); return () => this._statusListeners.delete(cb); }
  _setStatus(s) { this._status = s; this._statusListeners.forEach((cb) => cb(s)); }

  async _poll() {
    try {
      const { data } = await axios.get(`${API}/devices/${this.deviceId}/telemetry?limit=50`);
      const fresh = (data || []).filter((p) => new Date(p.timestamp).getTime() > this._lastTs);
      if (fresh.length) {
        this._lastTs = new Date(fresh[fresh.length - 1].timestamp).getTime();
        fresh.forEach((p) => this._listeners.forEach((cb) => cb(p)));
      }
      const status = await axios.get(`${API}/devices/${this.deviceId}/status`).then((r) => r.data).catch(() => null);
      this._setStatus({ status: status?.online ? 'connected' : 'idle', online: !!status?.online, pending: status?.pending_commands });
    } catch (e) {
      this._setStatus({ status: 'error', online: false, error: String(e?.message || e) });
    }
  }

  start() {
    if (this._timer) return;
    this._poll();
    this._timer = setInterval(() => this._poll(), this.pollMs);
  }

  publishCommand(type, value = null) {
    return axios.post(`${API}/devices/${this.deviceId}/commands`, { type, value })
      .then(() => true).catch(() => false);
  }
  triggerExcursion() { return this.publishCommand('excursion_test'); }
  setSetpoint(v) { return this.publishCommand('setpoint', v); }

  stop() { if (this._timer) clearInterval(this._timer); this._timer = null; this._setStatus({ status: 'stopped', online: false }); }
}

// Firebase adapter slot (future).
export class FirebaseAdapter {
  constructor(config) { this.config = config; this._listeners = new Set(); this._statusListeners = new Set(); }
  on(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  onStatus(cb) { this._statusListeners.add(cb); cb({ status: 'pending', online: false }); return () => this._statusListeners.delete(cb); }
  start() { /* TODO: initializeApp + onValue */ }
  publishCommand() { return false; }
  stop() {}
}

export function createDataSource(mode, opts) {
  if (mode === 'mqtt') return new MQTTService(opts);
  if (mode === 'http') return new HTTPDeviceAdapter(opts);
  if (mode === 'firebase') return new FirebaseAdapter(opts);
  return new DeviceSimulator(opts);
}
