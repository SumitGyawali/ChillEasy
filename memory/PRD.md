# VaxChain Monitor — PRD

## Original problem
IoT vaccine cold-chain monitoring + predictive temperature control + transport intelligence.
Two equal user types: field healthcare workers (mobile-first) and lab/hospital admins (desktop dashboard).

## Architecture
- **Backend**: FastAPI + MongoDB (motor). Routes prefixed `/api`.
- **Frontend**: React (CRA/CRACO) + Tailwind + Recharts + Leaflet/react-leaflet + TensorFlow.js + mqtt.js.
- **Data sources (pluggable)**:
  1. `DeviceSimulator` (default) — Gaussian temp around setpoint, GPS waypoint march, periodic excursions.
  2. `MQTTService` — real `mqtt.js` over WSS to a public broker (default HiveMQ); subscribes telemetry, publishes commands.
  3. `HTTPDeviceAdapter` — polls `/api/devices/{id}/telemetry`; commands enqueued via REST.
  4. `FirebaseAdapter` — slot reserved (config not wired yet).
- **Theme**: aerospace dark — `#0D0F14`/`#161A22`, `#3B8BD4` primary, `#EF9F27` warn, `#E24B4A` crit, `#1D9E75` ok. Barlow + IBM Plex Sans.

## Implemented (2026-04-28)

### Iteration 1 — full MVP
- 5 vaccine profiles seeded on backend startup; custom-vaccine inputs.
- Live Monitor: circular temp gauge, dual sensor with Δ>1°C fault chip, 60-min Recharts line with 2-8°C reference area + excursion dots, PID PWM bar, battery, GPS, session timer.
- Vaccine Potency Engine: arc gauge, Arrhenius `k(T)` driven by `Ea/R` shift from `(k_safe, T_safe)`, 12h forward projection, viability hours, cumulative °C·min exposure, critical banner.
- Predictive ML: TF.js closed-form linear regression on 10-pt sliding window → `T_pred(+15min)` → Arrhenius → predicted potency; risk score 0–100; MAE chip; confidence band; `ML_BREACH_PREDICTED` alert.
- Smart Alert Centre: `TEMP_HIGH/LOW`, `TEMP_RISING_FAST`, `SENSOR_FAULT`, `POTENCY_CRITICAL`, `BATTERY_LOW`, `COOLING_FAULT`, `ML_BREACH_PREDICTED`, `GEOFENCE_EXIT`. Sonner toast + Web Audio ping for critical.
- Nearest Cooling Unit Finder: Leaflet + CartoDB Dark + Overpass query (10km hospitals/pharmacies/clinics); Nominatim manual address fallback; auto-trigger on `POTENCY_CRITICAL`; re-query on >500m move.
- GPS Transport Tracker: polyline of full route, geofence circle, distance/speed/ETA chips.
- Session & Data Log: CSV export (timestamp, sensors, PWM, potency, predicted, GPS, alert flags); historical table + replay chart.
- Settings: data source toggle, MQTT URL/topic, thresholds, geofence, ML retrain cadence, demo excursion.

### Iteration 2 — NodeMCU bidirectional connectivity
- Backend ingest: `POST /api/ingest/{device_id}` (matches NodeMCU JSON exactly). Mirrors into session telemetry when `session_id` is included.
- Backend commands: `POST/GET /api/devices/{id}/commands` (UI enqueues, NodeMCU long-polls; `?consume=true` default).
- Backend status: `GET /api/devices/{id}/status` — `online` flag from `last_seen<60s`, `pending_commands` count.
- Frontend MQTT mode: real `mqtt.js` over WSS, subscribe `vaxchain/{deviceId}/telemetry`, publish `vaxchain/{deviceId}/cmd`.
- Frontend HTTP mode: polls every 4s; commands queued via REST.
- Settings: NodeMCU Device Link card (link-status chip, send setpoint, trigger excursion test, reset device); Mode dropdown adds HTTP option; device ID + topic prefix.
- Reference firmware: `/app/firmware/vaxchain_nodemcu.ino` (ESP32 + dual DS18B20 + Peltier PWM + GPS + battery ADC; MQTT first, HTTP fallback).
- Mobile sidebar reworked into true overlay drawer with backdrop; `GEOFENCE_EXIT` gated behind `settings.geofence.enabled`.

## Test status
- Iter 1: backend 4/4 pytest, frontend critical flows 100%.
- Iter 2: backend 10/10 pytest (incl. ingest/commands/status/mirror), frontend 100% on overlay drawer + GEOFENCE gate + Settings + HTTP end-to-end (curl ingest → UI gauge update).

## Backlog (not blocking)
- **P1**: Add Mongo indexes on `telemetry.session_id`, `sessions.started_at`, `alerts.session_id`, `device_telemetry.device_id`.
- **P1**: Replace `@app.on_event` with FastAPI lifespan; add `SessionUpdate` Pydantic model for PATCH whitelisting.
- **P1**: Telemetry pagination (since/until query params) — current 5000-row cap is ~4h of ticks.
- **P2**: Wire real `FirebaseAdapter` (Realtime DB onValue + Firestore writes) once user provides config.
- **P2**: Restrict CORS allow_origins in production.
- **P2**: Rename `/devices/{id}/commands` GET to `/commands/poll` to make consume semantics explicit.
- **P3**: Auth (JWT or Emergent Google) for admin dashboard vs device tokens.
