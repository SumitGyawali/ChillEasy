# VaxChain Monitor — PRD

## Original problem
IoT vaccine cold-chain monitoring + predictive temperature control + transport intelligence.
Two equal user types: field healthcare workers (mobile-first) and lab/hospital admins (desktop dashboard).

## Architecture
- **Backend**: FastAPI (lifespan-based) + MongoDB (motor). Routes prefixed `/api`. Indexes on hot paths. Env-driven CORS.
- **Frontend**: React (CRA/CRACO) + Tailwind + Recharts + Leaflet/react-leaflet + TensorFlow.js + mqtt.js + qrcode.react.
- **Pluggable data source**: DeviceSimulator (default), MQTTService (real mqtt.js/WSS), HTTPDeviceAdapter (REST polling), FirebaseAdapter (slot — see /app/memory/firebase_setup.md).
- **Theme**: aerospace dark — `#0D0F14`/`#161A22`, `#3B8BD4` primary, `#EF9F27` warn, `#E24B4A` crit, `#1D9E75` ok. Barlow + IBM Plex Sans.

## Implemented (2026-04-28)

### Iteration 1 — full MVP
- 7 sections: Live Monitor, Vaccine Potency Engine, Predictive ML, Smart Alert Centre, Nearest Cooling Unit Finder, GPS Transport Tracker, Sessions log + Settings.
- TF.js 10-pt sliding-window linear regression → Arrhenius potency projection → ML_BREACH_PREDICTED.
- Web Audio ping + Sonner toasts on critical alerts.
- 5 vaccine profiles seeded; custom-vaccine inputs.

### Iteration 2 — NodeMCU bidirectional connectivity
- Backend: `POST /api/ingest/{device_id}`, `POST/GET /api/devices/{id}/commands`, `GET /api/devices/{id}/status`.
- Frontend: real MQTT.js (WSS) and HTTP polling adapters with publishCommand; settings UI for setpoint/excursion/reset.
- Reference firmware `/app/firmware/vaxchain_nodemcu.ino` (ESP32 + dual DS18B20 + Peltier PWM + GPS + battery ADC).
- Mobile drawer rebuilt as overlay; GEOFENCE_EXIT gated on `geofence.enabled`.

### Iteration 3 — P1 hardening + QR provisioning
- FastAPI `lifespan` replaces deprecated `on_event`; idempotent vaccine seeding.
- 6 Mongo indexes: telemetry(session_id, timestamp), alerts(session_id, timestamp desc), sessions(started_at desc), device_telemetry(device_id, timestamp desc), device_commands(device_id, consumed, created_at), devices(id) unique.
- `SessionUpdate` Pydantic model with `extra="forbid"`; 422 on non-whitelisted fields, 400 on empty patch.
- `GET /api/sessions/{id}/telemetry?since=&until=&limit=&skip=` paginated time-window queries.
- CORS: `allow_credentials` only enabled when explicit origin list is set; `*` permitted only for dev.
- **QR-code device deploy** dialog on Settings: builds `{v,d,b,p,i,w?,t,ts}` payload (broker, topic, ingest URL, optional WiFi creds, provisioning token), renders 256×256 QR via `qrcode.react`, copy-JSON + token regenerate; live-updates as device id / SSID / token change.

## Test status
- Iter 1: backend 4/4, frontend critical 100%.
- Iter 2: backend 10/10, frontend 100% (mobile overlay + HTTP curl→UI end-to-end).
- Iter 3: backend 20/20 (10 new P1 + 10 regression), frontend 100% on QR flow.

## Backlog
- **P1 done**: indexes ✓, pagination ✓, SessionUpdate whitelist ✓, lifespan ✓.
- **P2 done**: CORS hardened (allow_credentials gated on explicit origins).
- **P2 pending — needs user input**: FirebaseAdapter activation. See `/app/memory/firebase_setup.md` for the exact list of values required.
- **P3**: replace `Math.random()` token with `crypto.getRandomValues` or backend-issued HMAC tokens for production audit trail.
- **P3**: Auth (JWT or Emergent Google) for admin dashboard vs device tokens.
- **P3**: Rename consuming poll endpoint (`/devices/{id}/commands` GET) to `/commands/poll` for clarity.
