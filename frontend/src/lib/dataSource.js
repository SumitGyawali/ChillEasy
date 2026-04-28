// Pluggable data source: Simulator (default), MQTT (stub), Firebase (future slot).
// Real NodeMCU ESP32 schema:
// { sensor1: float, sensor2: float, pwm_pct: float, battery_pct: float, lat: float, lng: float, timestamp: ISO8601 }

const DEFAULT_ROUTE = [
  [12.9716, 77.5946], // Bangalore
  [12.9750, 77.6000],
  [12.9810, 77.6080],
  [12.9890, 77.6160],
  [12.9970, 77.6240],
  [13.0050, 77.6320],
];

function gauss(mu = 0, sigma = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class DeviceSimulator {
  constructor({ setpointC = 5, route = DEFAULT_ROUTE, intervalMs = 20000 } = {}) {
    this.setpointC = setpointC;
    this.route = route;
    this.intervalMs = intervalMs;
    this._listeners = new Set();
    this._timer = null;
    this._t = 0; // step
    this._battery = 100;
    this._pwm = 25;
    this._currentTemp = setpointC;
    this._excursionRemaining = 0;
    this._excursionPeak = 5; // delta °C target
    this._segIdx = 0;
    this._segProgress = 0;
  }

  on(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  setSetpoint(s) { this.setpointC = s; }
  triggerExcursion(durationMin = 5, peakDeltaC = 10) {
    // Inject thermal excursion: drift to setpoint+peakDeltaC over ~half the duration, then recover.
    this._excursionRemaining = Math.ceil((durationMin * 60 * 1000) / this.intervalMs);
    this._excursionPeak = peakDeltaC;
  }

  _nextGPS() {
    // March along the polyline; loop when reached the end.
    if (this._segIdx >= this.route.length - 1) {
      this._segIdx = 0;
      this._segProgress = 0;
    }
    const a = this.route[this._segIdx];
    const b = this.route[this._segIdx + 1];
    this._segProgress += 0.04 + Math.random() * 0.02;
    if (this._segProgress >= 1) {
      this._segProgress = 0;
      this._segIdx++;
    }
    const p = Math.min(this._segProgress, 1);
    return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
  }

  _nextTemp() {
    let target = this.setpointC;
    if (this._excursionRemaining > 0) {
      // Bell-curve envelope across remaining steps
      const totalSteps = Math.max(1, Math.ceil((5 * 60 * 1000) / this.intervalMs));
      const phase = 1 - this._excursionRemaining / totalSteps;
      const envelope = Math.sin(Math.max(0, Math.min(1, phase)) * Math.PI);
      target = this.setpointC + this._excursionPeak * envelope;
      this._excursionRemaining--;
    }
    // PID-like approach: temp moves toward target with noise
    this._currentTemp += (target - this._currentTemp) * 0.35 + gauss(0, 0.15);
    // PWM responds inversely (cooling harder when above setpoint)
    const error = this._currentTemp - this.setpointC;
    this._pwm = Math.max(0, Math.min(100, 25 + error * 12 + gauss(0, 1.5)));
    return this._currentTemp;
  }

  _emit() {
    const t = this._nextTemp();
    const sensor1 = +(t + gauss(0, 0.05)).toFixed(2);
    const sensor2 = +(t + gauss(0, 0.05)).toFixed(2);
    // Occasional sensor fault demo (1% probability after 50 steps)
    const faultInjection = this._t > 50 && Math.random() < 0.005;
    const s2 = faultInjection ? +(sensor2 + 1.6).toFixed(2) : sensor2;
    const [lat, lng] = this._nextGPS();
    this._battery = Math.max(0, this._battery - 0.05 - Math.random() * 0.02);
    const point = {
      sensor1,
      sensor2: s2,
      pwm_pct: +this._pwm.toFixed(1),
      battery_pct: +this._battery.toFixed(1),
      lat: +lat.toFixed(6),
      lng: +lng.toFixed(6),
      timestamp: new Date().toISOString(),
    };
    this._t++;
    this._listeners.forEach((cb) => cb(point));
  }

  start() {
    if (this._timer) return;
    this._emit(); // immediate first tick
    this._timer = setInterval(() => this._emit(), this.intervalMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}

// MQTT service stub — keeps shape identical so swap is one-line.
// Real implementation would use mqtt.js connecting to mqtts://broker.hivemq.com:8884/mqtt
export class MQTTService {
  constructor({ url = 'wss://broker.hivemq.com:8884/mqtt', topic = 'vaxchain/telemetry' } = {}) {
    this.url = url;
    this.topic = topic;
    this._listeners = new Set();
    this._connected = false;
  }
  on(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  start() { this._connected = false; /* would connect here */ }
  stop() { this._connected = false; }
  publish() { /* stub */ }
  isConnected() { return this._connected; }
}

// Firebase adapter slot (future — wire up Realtime DB onValue listener).
export class FirebaseAdapter {
  constructor(config) { this.config = config; this._listeners = new Set(); }
  on(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  start() { /* TODO: initializeApp(config) + onValue */ }
  stop() {}
}

export function createDataSource(mode, opts) {
  if (mode === 'mqtt') return new MQTTService(opts);
  if (mode === 'firebase') return new FirebaseAdapter(opts);
  return new DeviceSimulator(opts);
}
