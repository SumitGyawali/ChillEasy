# VaxChain Monitor — PRD

## Original problem
IoT vaccine cold-chain monitoring + predictive temperature control + transport intelligence. Two equal user types: field healthcare workers (mobile-first) and lab/hospital admins (desktop). Aerospace dark control-room aesthetic.

## Architecture
- **Backend**: FastAPI (lifespan) + MongoDB (motor). `/api` prefix. Indexes on hot paths. Env-driven CORS.
- **Auth**: dual-mode — Emergent Google OAuth (httpOnly cookie) + JWT email/password (Bearer). Unified `/api/auth/me`. Pre-seeded QA: `qa@vaxchain.test / Passw0rd!`.
- **Frontend**: React + Tailwind + Recharts + Leaflet/react-leaflet + TensorFlow.js + mqtt.js + qrcode.react + firebase@12.
- **Pluggable data source**: Simulator, MQTT (mqtt.js WSS), HTTP REST adapter, **Firebase Realtime DB** (live).
- **Firebase bridge (Option B)**: backend writes telemetry+status+commands into RTDB; firmware stays on MQTT/HTTP unchanged.
- **Theme**: `#0D0F14`/`#161A22`, `#3B8BD4`/`#EF9F27`/`#E24B4A`/`#1D9E75`. Barlow + IBM Plex Sans.

## Implementation history

### Iter 1 — MVP (4/4 pytest)
7 sections; 5 vaccines; TF.js sliding-window LR + Arrhenius potency; Sonner+Web Audio alerts; Leaflet maps; CSV export.

### Iter 2 — NodeMCU bidirectional (10/10)
MQTT/HTTP adapters + commands/status; ESP32 reference firmware; mobile drawer; geofence gating.

### Iter 3 — P1 hardening + QR (20/20)
Lifespan + 6 indexes; SessionUpdate whitelist; telemetry pagination; CORS hardened; QR-code device-deploy dialog.

### Iter 4 — P3 backlog (39/39)
Crypto-grade provisioning tokens (256-bit + HMAC-SHA256); dual auth (Emergent OAuth + JWT); `/commands/poll` rename.

### Iter 5 — Firebase RTDB adapter
`firebase@12.x` + `firebaseClient.js` (anonymous default); `FirebaseAdapter` with `onValue` + `push`; Settings dropdown updated.

### Iter 6 — Firebase custom-token auth + backend bridge
- **Backend**: `firebase-admin` SDK; `firebase_bridge.py` module with `mirror_telemetry`, `mirror_status`, `mirror_command`, `mint_custom_token`. All graceful no-op if `FIREBASE_SERVICE_ACCOUNT_JSON` env is missing.
- **`POST /api/firebase/token`** — auth-required; returns Firebase custom token tied to VaxChain `user_id` + claims `{email, name}`.
- **Bridge wiring**: `/api/ingest/{id}` mirrors telemetry+status to RTDB; `/api/devices/{id}/commands` mirrors to RTDB. NodeMCU firmware unchanged.
- **Frontend**: `REACT_APP_FB_AUTH_MODE=custom` triggers `signInWithCustomToken` via backend mint; `FirebaseAdapter.publishCommand` routes through backend so MQTT/HTTP devices receive commands too.
- `/app/memory/firebase_setup.md` updated with service-account-key instructions.

## Test status
Iter 1: 4/4 ✓ · Iter 2: 10/10 ✓ · Iter 3: 20/20 ✓ · Iter 4: 39/39 ✓ · Iter 5: 39/39 ✓ + FE Firebase wiring · Iter 6: backend + FE smoke verified manually (401/503/200 on token endpoint without/with SA configured; ingest still works).

## Backlog
- **P2 awaiting user**: Firebase service-account JSON to activate live bridge + custom tokens. See `/app/memory/firebase_setup.md`.
- **P3 polish**: re-enable `EmailStr` in production; centralise auth TTL constant; document JWT-in-localStorage XSS trade-off; Recharts 0×0 cosmetic warning.
- **P4**: tie sessions to `user_id` for per-user isolation; admin fleet console at `/devices` (real-time presence via RTDB).
- **P4**: add `device_ids` claim to Firebase custom tokens for per-device RTDB rules.
