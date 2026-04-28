# Firebase setup — final 2 steps in the Firebase Console

You've already provided the Web config. Two console toggles remain (no code changes needed on our side):

## 1. Enable Anonymous sign-in
1. Open https://console.firebase.google.com/project/chilleasy-842fc/authentication/providers
2. Click **Anonymous** → toggle **Enable** → **Save**

## 2. Set Realtime Database rules
1. Open https://console.firebase.google.com/project/chilleasy-842fc/database/chilleasy-842fc-default-rtdb/rules
2. Paste:
```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        ".read": "auth != null",
        "telemetry": { ".write": "auth != null" },
        "cmd":       { ".write": "auth != null" },
        "status":    { ".write": "auth != null" }
      }
    }
  }
}
```
3. **Publish**.

## How to verify
- In VaxChain Settings → Mode → select **Firebase Realtime DB** → click **Start**.
- Top bar `LINK · CONNECTED · firebase-rtdb` chip turns green.
- To inject a sample telemetry point so the dashboard updates, paste this into the RTDB console at path `devices/vx-001/telemetry/live`:
```json
{ "sensor1": 5.2, "sensor2": 5.1, "pwm_pct": 28, "battery_pct": 96, "lat": 12.97, "lng": 77.59, "timestamp": "2026-04-28T17:30:00Z" }
```
The chamber gauge will update within ~1 second.

## NodeMCU side (optional)
Two paths supported:
- **a) Direct Firebase**: use `mobizt/Firebase-ESP-Client` library on ESP32, call `Firebase.RTDB.setJSON("devices/vx-001/telemetry/live", payload)` every 20s and listen on `devices/vx-001/cmd` for commands. Auth: anonymous via `Firebase.signInAnonymously(...)`.
- **b) Backend bridge**: keep the current MQTT/HTTP firmware unchanged; we'll add a small Python worker that mirrors `db.device_telemetry` rows into RTDB (would be a future P4 ticket). Tell me if you want option (b) and I'll add it.

## Auth model used
- Frontend: signInAnonymously via Firebase JS SDK on first session start.
- DB writes/reads: gated on `auth != null` (any anonymous session works).
- For production, swap to **custom token** auth: backend mints a Firebase custom token tied to the VaxChain JWT user; rules can then check `auth.token.user_id` or `auth.token.deviceId`. Ping me to wire this when you're ready.
