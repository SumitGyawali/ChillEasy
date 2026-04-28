# VaxChain Monitor — PRD

## Original problem
IoT vaccine cold-chain monitoring + predictive temperature control + transport intelligence. Two equal user types: field healthcare workers (mobile-first) and lab/hospital admins (desktop). Aerospace dark control-room aesthetic.

## Architecture
- **Backend**: FastAPI (lifespan) + MongoDB (motor). `/api` prefix. Indexes on hot paths. Env-driven CORS.
- **Auth**: dual-mode — Emergent Google OAuth (httpOnly cookie) + JWT email/password (Bearer). Unified `/api/auth/me`. Pre-seeded QA: `qa@vaxchain.test / Passw0rd!`.
- **Frontend**: React + Tailwind + Recharts + Leaflet/react-leaflet + TensorFlow.js + mqtt.js + qrcode.react.
- **Pluggable data source**: DeviceSimulator (default), MQTT (mqtt.js WSS), HTTPDeviceAdapter, FirebaseAdapter slot (config requirements at `/app/memory/firebase_setup.md`).
- **Theme**: `#0D0F14`/`#161A22`, `#3B8BD4`/`#EF9F27`/`#E24B4A`/`#1D9E75`. Barlow + IBM Plex Sans.

## Implementation history

### Iter 1 — MVP
7 sections; 5 vaccine profiles; TF.js sliding-window LR + Arrhenius potency; Sonner+Web Audio alerts; Leaflet maps; CSV export.

### Iter 2 — NodeMCU bidirectional
MQTT (real mqtt.js) + HTTP fallback adapters; `/api/ingest`, `/api/devices/{id}/commands` & `/status`; reference ESP32 firmware; mobile drawer overlay; geofence gating.

### Iter 3 — P1 hardening + QR Deploy
Lifespan replaces on_event; 6 Mongo indexes; `SessionUpdate` whitelist (`extra='forbid'`); telemetry pagination (`since/until/limit/skip`); CORS hardened (credentials gated on explicit origins). QR-code device-deploy dialog with HMAC-ready payload.

### Iter 4 — P3 backlog
- **Crypto-grade provisioning token**: 256-bit `crypto.getRandomValues` → 64-hex; backend `/api/provisioning/tokens` mints + `/verify` validates HMAC-SHA256 signature (`device_id|token|expires_at`).
- **Dual auth**:
  - `/api/auth/register|login|me|logout|session` — JWT (HS256, 14d) for email/password; `session_token` httpOnly cookie (7d) for Emergent Google.
  - Frontend: `/login`, `/register`, `/AuthCallback` for `#session_id=` exchange; `<ProtectedRoute>` 3-state; user menu in topbar.
- **Poll endpoint rename**: `GET /api/devices/{id}/commands/poll` consumes atomically; `/commands` is now non-consuming preview (`?consume=true` retained for legacy).

## Test status
- Iter 1: 4/4 ✓ · Iter 2: 10/10 ✓ · Iter 3: 20/20 ✓ · Iter 4: **39/39 pytest** ✓ + full frontend auth flow validated (login, register, refresh, logout, mobile, crypto QR token).

## Backlog
- **P2 pending — needs user input**: FirebaseAdapter activation. See `/app/memory/firebase_setup.md`.
- **P3 minor**: re-enable `EmailStr` in production (relaxed to plain str so `.test` TLDs work in QA); document JWT-in-localStorage XSS trade-off (or move to httpOnly cookie everywhere); centralise auth TTL constant.
- **P4**: Recharts 0×0-container warning on initial Live Monitor render (cosmetic).
- **P4**: tie `sessions` to `user_id` for per-user isolation (currently public).
- **P4**: Admin fleet view at `/devices` listing every NodeMCU + rebroadcast QR / pending commands / online status.
