# Firebase setup — final remaining step

You've already enabled Anonymous auth + RTDB rules. To activate the **backend bridge** + **custom-token auth** (Option B), one last thing is needed:

## Generate a Firebase service-account key

1. Open https://console.firebase.google.com/project/chilleasy-842fc/settings/serviceaccounts/adminsdk
2. Click **Generate new private key** → confirm.
3. A JSON file downloads (it contains `private_key`, `client_email`, etc.). **Treat it like a password** — never commit it.

## Install it on the backend (two options)

### Option 1 — paste literal JSON into env (simplest)
Edit `/app/backend/.env`:
```env
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"chilleasy-842fc",...full JSON on one line...}'
```
(Single-line JSON inside single quotes. The newlines inside `private_key` should remain as `\n` escapes — exactly as Firebase exports it.)

### Option 2 — store as a file
Save the downloaded JSON to e.g. `/app/backend/firebase-sa.json`, then edit `.env`:
```env
FIREBASE_SERVICE_ACCOUNT_JSON="/app/backend/firebase-sa.json"
```

## Then restart the backend
```bash
sudo supervisorctl restart backend
```

## Switch frontend to custom-token auth
Edit `/app/frontend/.env`:
```env
REACT_APP_FB_AUTH_MODE=custom
```
Restart frontend:
```bash
sudo supervisorctl restart frontend
```

## Lock down RTDB rules (optional but recommended)
With custom tokens you can enforce per-user / per-device:
```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        ".read":  "auth != null",
        ".write": "auth != null && auth.token.email != null"
      }
    }
  }
}
```
(Custom tokens carry whatever `claims` we mint — currently `email` and `name`. We can add `device_ids` to claims if you want stricter rules; tell me when you're ready.)

## What the bridge does (Option B summary)
- Every `POST /api/ingest/{id}` → also writes to RTDB `devices/{id}/telemetry/live` and bumps `devices/{id}/status.online=true` (NodeMCU stays on MQTT/HTTP — firmware **unchanged**).
- Every `POST /api/devices/{id}/commands` → also pushes to RTDB `devices/{id}/cmd`.
- Frontend FirebaseAdapter → routes commands through backend (same path) so MQTT/HTTP devices receive them too.
- All bridge calls are no-op if `FIREBASE_SERVICE_ACCOUNT_JSON` is empty — the rest of the app keeps working in MongoDB-only mode.

## Verify end-to-end
After restart, in VaxChain → Settings → Mode → **Firebase Realtime DB** → Start. You should see:
- LINK chip flips to `CONNECTED · firebase-rtdb` (custom-token auth handshake).
- The Live Monitor gauge updates the moment any telemetry hits `/api/ingest/{your-device-id}`.
- The cmd buttons (Send setpoint / Trigger excursion / Reset device) write to both Mongo `device_commands` AND RTDB `devices/{id}/cmd`.
