import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { createDataSource } from '../lib/dataSource';
import { arrheniusK, stepPotency, viabilityHours, cumulativeExposure } from '../lib/vaccines';
import { fitAndPredict, riskScore } from '../lib/ml';
import { pingCritical } from '../lib/audio';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SessionCtx = createContext(null);
export const useSession = () => useContext(SessionCtx);

const DEFAULTS = {
  source: 'simulator',
  setpointC: 5,
  unit: 'C',
  thresholds: { tempLow: 2, tempHigh: 8, rateLimit: 0.5, potencyMin: 80, batteryLow: 20 },
  geofence: { lat: 13.005, lng: 77.632, radiusM: 800, enabled: false },
  mqtt: { url: 'wss://broker.hivemq.com:8884/mqtt', topicPrefix: 'vaxchain' },
  device: { id: 'vx-001' },
  mlIntervalMin: 5,
};

const STORAGE_KEY = 'vxc_settings_v1';

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return DEFAULTS; }
}

export function SessionProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings());
  const [vaccines, setVaccines] = useState([]);
  const [vaccineId, setVaccineId] = useState('hepb');
  const [customVaccine, setCustomVaccine] = useState(null);
  const [session, setSession] = useState(null);
  const [telemetry, setTelemetry] = useState([]); // {t, sensor1, sensor2, temp, pwm, battery, lat, lng, potency, predicted}
  const [alerts, setAlerts] = useState([]);
  const [ml, setMl] = useState(null);
  const [running, setRunning] = useState(false);
  const [linkStatus, setLinkStatus] = useState({ status: 'idle', online: false });

  const sourceRef = useRef(null);
  const sessionRef = useRef(null);
  const telemRef = useRef([]);
  const potencyRef = useRef(100);
  const lastTimeRef = useRef(null);
  const lastMLAtRef = useRef(0);
  const alertCooldownRef = useRef({});
  const flushBufferRef = useRef([]);

  const persistSettings = (next) => {
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  // Fetch vaccines
  useEffect(() => {
    axios.get(`${API}/vaccines`).then((r) => setVaccines(r.data)).catch(() => {});
  }, []);

  const activeVaccine = useMemo(() => {
    if (vaccineId === 'custom' && customVaccine) return customVaccine;
    return vaccines.find((v) => v.id === vaccineId) || vaccines[0] || null;
  }, [vaccineId, customVaccine, vaccines]);

  const raiseAlert = useCallback(async (type, severity, message, payload = null) => {
    // 60s cooldown per type
    const now = Date.now();
    if (now - (alertCooldownRef.current[type] || 0) < 60000) return;
    alertCooldownRef.current[type] = now;

    const local = {
      id: `${type}-${now}`,
      type, severity, message, payload,
      timestamp: new Date().toISOString(),
      dismissed: false,
      session_id: sessionRef.current?.id,
    };
    setAlerts((prev) => [local, ...prev].slice(0, 200));

    if (severity === 'critical') {
      pingCritical();
      toast.error(message, { description: type, duration: 6000 });
    } else if (severity === 'warning') {
      toast.warning(message, { description: type, duration: 4500 });
    } else {
      toast(message, { description: type });
    }

    if (sessionRef.current?.id) {
      axios.post(`${API}/alerts`, {
        session_id: sessionRef.current.id, type, severity, message, payload,
      }).catch(() => {});
    }
  }, []);

  const dismissAlert = useCallback((id) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a)));
    axios.patch(`${API}/alerts/${id}/dismiss`).catch(() => {});
  }, []);

  const handlePoint = useCallback((p) => {
    const temp = (p.sensor1 + p.sensor2) / 2;
    const now = new Date(p.timestamp).getTime();
    const prevT = lastTimeRef.current;
    const dtHours = prevT ? Math.max(0.0001, (now - prevT) / 3600000) : 0;
    lastTimeRef.current = now;

    const vac = activeVaccine;
    const newPotency = vac && dtHours > 0
      ? stepPotency(potencyRef.current, temp, dtHours, vac)
      : potencyRef.current;
    potencyRef.current = newPotency;

    const enriched = {
      t: p.timestamp,
      sensor1: p.sensor1,
      sensor2: p.sensor2,
      temp,
      pwm: p.pwm_pct,
      battery: p.battery_pct,
      lat: p.lat,
      lng: p.lng,
      potency: newPotency,
    };
    telemRef.current = [...telemRef.current, enriched].slice(-2000);
    setTelemetry(telemRef.current);

    flushBufferRef.current.push(p);

    // ===== Alert logic =====
    const th = settings.thresholds;
    if (temp > th.tempHigh) raiseAlert('TEMP_HIGH', 'critical', `Temperature high: ${temp.toFixed(2)}°C`, { temp });
    if (temp < th.tempLow) raiseAlert('TEMP_LOW', 'critical', `Temperature low: ${temp.toFixed(2)}°C`, { temp });
    if (Math.abs(p.sensor1 - p.sensor2) > 1.0) raiseAlert('SENSOR_FAULT', 'warning', `Sensor divergence ${Math.abs(p.sensor1 - p.sensor2).toFixed(2)}°C`, { s1: p.sensor1, s2: p.sensor2 });
    if (p.battery_pct < th.batteryLow) raiseAlert('BATTERY_LOW', 'warning', `Battery low: ${p.battery_pct.toFixed(1)}%`);

    // Rate-of-change (last 4 points)
    const tail = telemRef.current.slice(-4);
    if (tail.length >= 2) {
      const dtMin = (new Date(tail[tail.length - 1].t) - new Date(tail[0].t)) / 60000;
      const dT = tail[tail.length - 1].temp - tail[0].temp;
      const rate = dtMin > 0 ? dT / dtMin : 0;
      if (rate > th.rateLimit) raiseAlert('TEMP_RISING_FAST', 'warning', `Temperature rising ${rate.toFixed(2)}°C/min`);
    }

    // Cooling fault: PWM saturated >90% for last 6 ticks AND temp not falling
    if (telemRef.current.length >= 6) {
      const last6 = telemRef.current.slice(-6);
      const allHigh = last6.every((x) => x.pwm > 90);
      const dT = last6[last6.length - 1].temp - last6[0].temp;
      if (allHigh && dT > -0.05) raiseAlert('COOLING_FAULT', 'critical', 'PWM saturated, no cooling response');
    }

    if (vac && newPotency < vac.min_potency_pct) raiseAlert('POTENCY_CRITICAL', 'critical', `Potency below ${vac.min_potency_pct}%: ${newPotency.toFixed(1)}%`, { potency: newPotency });

    // Geofence check (only when explicitly enabled)
    const gf = settings.geofence;
    if (gf && gf.enabled && gf.radiusM > 0) {
      const d = haversine(p.lat, p.lng, gf.lat, gf.lng);
      if (d > gf.radiusM) raiseAlert('GEOFENCE_EXIT', 'warning', `Off-route: ${(d/1000).toFixed(2)}km from destination`);
    }

    // ===== ML retrain (every mlIntervalMin minutes) =====
    if (telemRef.current.length >= 10 && now - lastMLAtRef.current > settings.mlIntervalMin * 60000) {
      const window10 = telemRef.current.slice(-10).map((x) => ({ timestamp: x.t, sensor1: x.sensor1, sensor2: x.sensor2 }));
      const fit = fitAndPredict(window10, 15);
      if (fit && vac) {
        const dtH = fit.horizonMin / 60;
        const k = arrheniusK(fit.tPred, vac);
        const predictedPotency = newPotency * Math.exp(-k * dtH);
        const r = riskScore({
          slope: fit.slope,
          currentTemp: temp,
          predictedPotency,
          currentPotency: newPotency,
          battery: p.battery_pct,
          threshold: vac.min_potency_pct,
        });
        const next = { ...fit, predictedPotency, riskScore: r, updatedAt: new Date().toISOString(), vaccineId: vac.id };
        setMl(next);
        lastMLAtRef.current = now;
        if (predictedPotency < vac.min_potency_pct) {
          raiseAlert('ML_BREACH_PREDICTED', 'critical',
            `Forecast: potency ${predictedPotency.toFixed(1)}% in 15 min`, { predictedPotency, tPred: fit.tPred });
        }
      }
    }
  }, [activeVaccine, settings, raiseAlert]);

  // Persist telemetry batch to backend every 30s
  useEffect(() => {
    const id = setInterval(() => {
      if (!sessionRef.current?.id || flushBufferRef.current.length === 0) return;
      const points = flushBufferRef.current;
      flushBufferRef.current = [];
      axios.post(`${API}/sessions/${sessionRef.current.id}/telemetry`, { points }).catch(() => {
        flushBufferRef.current = [...points, ...flushBufferRef.current];
      });
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const startSession = useCallback(async () => {
    if (running) return;
    if (!activeVaccine) { toast.error('Select a vaccine first'); return; }
    let s = sessionRef.current;
    if (!s) {
      const { data } = await axios.post(`${API}/sessions`, {
        vaccine_id: activeVaccine.id || vaccineId,
        setpoint_c: settings.setpointC,
        destination: { lat: settings.geofence.lat, lng: settings.geofence.lng, radius_m: settings.geofence.radiusM },
      });
      s = data;
      sessionRef.current = s;
      setSession(s);
    }
    potencyRef.current = 100;
    lastTimeRef.current = null;
    telemRef.current = [];
    setTelemetry([]);
    setAlerts([]);
    setMl(null);
    sourceRef.current = createDataSource(settings.source, {
      setpointC: settings.setpointC,
      intervalMs: 3000,
      url: settings.mqtt.url,
      topicPrefix: settings.mqtt.topicPrefix,
      deviceId: settings.device.id,
    });
    sourceRef.current.on(handlePoint);
    if (sourceRef.current.onStatus) sourceRef.current.onStatus(setLinkStatus);
    sourceRef.current.start();
    setRunning(true);
    toast.success('Session started', { description: `Monitoring ${activeVaccine.name} via ${settings.source}` });
  }, [running, activeVaccine, vaccineId, settings, handlePoint]);

  const stopSession = useCallback(async () => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setRunning(false);
    setLinkStatus({ status: 'idle', online: false });
    if (sessionRef.current?.id) {
      const tel = telemRef.current;
      const summary = tel.length ? {
        duration_min: (new Date(tel[tel.length - 1].t) - new Date(tel[0].t)) / 60000,
        min_temp: Math.min(...tel.map((x) => x.temp)),
        max_temp: Math.max(...tel.map((x) => x.temp)),
        breach_count: alerts.filter((a) => a.severity === 'critical').length,
        final_potency: tel[tel.length - 1].potency,
        vaccine_name: activeVaccine?.name,
      } : null;
      axios.patch(`${API}/sessions/${sessionRef.current.id}`, {
        ended_at: new Date().toISOString(), summary,
      }).catch(() => {});
      sessionRef.current = null;
      setSession(null);
    }
    toast('Session stopped');
  }, [activeVaccine, alerts]);

  const triggerExcursion = useCallback(() => {
    if (sourceRef.current?.triggerExcursion) {
      sourceRef.current.triggerExcursion(5, 11);
      toast('Thermal excursion injected', { description: 'Demo: drift to ~16°C over 5 min' });
    }
  }, []);

  const sendCommand = useCallback(async (type, value = null) => {
    if (!sourceRef.current?.publishCommand) {
      toast.error('No active link. Start session first.');
      return false;
    }
    const ok = await Promise.resolve(sourceRef.current.publishCommand(type, value));
    if (ok) toast.success(`Command sent: ${type}${value !== null ? ` = ${value}` : ''}`);
    else toast.error(`Command failed: ${type}`);
    return ok;
  }, []);

  // Derived metrics
  const latest = telemetry[telemetry.length - 1] || null;
  const exposure = useMemo(() => cumulativeExposure(telemetry, settings.thresholds.tempHigh), [telemetry, settings.thresholds.tempHigh]);
  const viability = useMemo(() => {
    if (!latest || !activeVaccine) return null;
    return viabilityHours(latest.potency, latest.temp, activeVaccine);
  }, [latest, activeVaccine]);

  const value = {
    settings, persistSettings,
    vaccines, vaccineId, setVaccineId,
    customVaccine, setCustomVaccine,
    activeVaccine,
    session, running,
    telemetry, latest,
    alerts, dismissAlert, raiseAlert,
    ml, exposure, viability,
    startSession, stopSession, triggerExcursion, sendCommand, linkStatus,
  };

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
