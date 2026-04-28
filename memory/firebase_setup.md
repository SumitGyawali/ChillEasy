# Wiring `FirebaseAdapter` — what I need from you

The slot lives at `/app/frontend/src/lib/dataSource.js` (`class FirebaseAdapter`). To activate it, please share the following — all values come from the **Firebase Console → Project Settings → General** and **Realtime Database** tabs.

## 1. Firebase Web App config (mandatory)
The exact `firebaseConfig` object Google gives you when you "Add app → Web". I need every field below — they all come pasted together:

| Key              | Where to get it                                               |
| ---------------- | ------------------------------------------------------------- |
| `apiKey`         | Project settings → Web app config                             |
| `authDomain`     | Project settings → Web app config                             |
| `projectId`      | Project settings → Web app config                             |
| `databaseURL`    | Realtime Database tab → Data → URL (e.g., `https://xxx.firebaseio.com` or `https://xxx-default-rtdb.<region>.firebasedatabase.app`) |
| `storageBucket`  | Project settings → Web app config (only if you want hosted images later) |
| `appId`          | Project settings → Web app config                             |
| `messagingSenderId` | Project settings → Web app config                          |

## 2. Realtime Database paths (mandatory)
Confirm or override the defaults I'll use:
- **Telemetry stream** path the NodeMCU writes to: `devices/{deviceId}/telemetry/live` (single object, overwritten each tick)
- **Telemetry history** path (optional, for replays): `devices/{deviceId}/telemetry/history` (push-keyed list)
- **Commands** path the NodeMCU listens on: `devices/{deviceId}/cmd`
- **Status** path the NodeMCU writes presence to: `devices/{deviceId}/status` (`{online, last_seen}`)

## 3. Auth model (pick one)
- **a) Anonymous auth** — simplest; I call `signInAnonymously()` on adapter start. **Required**: enable *Authentication → Sign-in method → Anonymous*.
- **b) Custom token** — backend mints short-lived tokens. **Required**: a Firebase service-account JSON for the backend (private key); I'll add `/api/firebase/token` that issues custom tokens.
- **c) Open public DB** — only acceptable for demos. **Required**: confirm you accept open read/write rules.

## 4. Database security rules
A working starter set (paste into Firebase Console → Realtime Database → Rules):
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
If you want stricter per-device tokens, share the claim shape (e.g., `auth.token.deviceId == $deviceId`).

## 5. Firestore (optional — only if you want sessions/alerts mirrored there)
- **Database location** (e.g., `nam5`, `eur3`)
- Confirm collection names: `sessions`, `alerts`, `vaccines` (or override).
- Same auth model decision as above.

## 6. NodeMCU side — what changes on the device
You'll either:
- **Use the Firebase ESP-Client library** (`firebase-arduino-client` or `mobizt/Firebase-ESP-Client`) — needs `apiKey`, `databaseURL`, and an auth token (anonymous or service-account exchange).
- Or keep MQTT/HTTP and let a **backend bridge** mirror to Firebase. Tell me which path you prefer; I'll update `/app/firmware/vaxchain_nodemcu.ino` accordingly.

---

## Drop-in template
Reply with the values filled in, and I'll do the rest in a single iteration:

```env
# /app/frontend/.env (do NOT delete REACT_APP_BACKEND_URL or WDS_SOCKET_PORT)
REACT_APP_FB_API_KEY=
REACT_APP_FB_AUTH_DOMAIN=
REACT_APP_FB_PROJECT_ID=
REACT_APP_FB_DATABASE_URL=
REACT_APP_FB_STORAGE_BUCKET=
REACT_APP_FB_APP_ID=
REACT_APP_FB_MESSAGING_SENDER_ID=
REACT_APP_FB_AUTH_MODE=anonymous   # anonymous | custom | open
```

Plus, paste the chosen security rules, the database location (Firestore region), and confirm the path layout above. That's everything I need.
