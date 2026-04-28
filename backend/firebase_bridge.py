"""
Firebase Admin bridge — backend ↔ Firebase Realtime DB.

Runs as an opt-in module. If FIREBASE_SERVICE_ACCOUNT_JSON env var is missing or
invalid, every function becomes a graceful no-op so the rest of the app continues
to work in MongoDB-only mode.

Responsibilities:
  - mirror_telemetry: copy each /api/ingest payload to RTDB devices/{id}/telemetry/live
  - mirror_status:    update RTDB devices/{id}/status when the device is seen
  - mirror_command:   push every UI-enqueued command to RTDB devices/{id}/cmd
  - mint_custom_token: issue Firebase custom tokens tied to VaxChain user_id
                       so RTDB rules can enforce per-user / per-device access
"""
import os
import json
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

_app = None
_db_ref = None
_initialized_attempted = False


def _service_account():
    """Resolve service-account credentials from env (JSON literal or path)."""
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        return None
    try:
        if raw.lstrip().startswith("{"):
            return json.loads(raw)
        # treat as path
        with open(raw, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Could not parse FIREBASE_SERVICE_ACCOUNT_JSON: %s", e)
        return None


def init():
    """Idempotent lazy init. Returns True if Firebase is ready."""
    global _app, _db_ref, _initialized_attempted
    if _app is not None:
        return True
    if _initialized_attempted:
        return False
    _initialized_attempted = True

    sa = _service_account()
    if not sa:
        logger.info("Firebase bridge disabled — no service account configured.")
        return False
    try:
        import firebase_admin
        from firebase_admin import credentials, db as fb_db
        cred = credentials.Certificate(sa)
        db_url = os.environ.get("FIREBASE_DATABASE_URL") or sa.get("databaseURL")
        if not db_url:
            logger.warning("Firebase bridge: FIREBASE_DATABASE_URL missing.")
            return False
        _app = firebase_admin.initialize_app(cred, {"databaseURL": db_url})
        _db_ref = fb_db.reference("/", app=_app)
        logger.info("Firebase bridge initialised against %s", db_url)
        return True
    except Exception as e:
        logger.warning("Firebase bridge init failed: %s", e)
        return False


def is_ready() -> bool:
    return _app is not None


def mirror_telemetry(device_id: str, payload: Dict[str, Any]):
    if not init(): return
    try:
        _db_ref.child(f"devices/{device_id}/telemetry/live").set(payload)
        # Append a small history entry (push-keyed, capped client-side).
        _db_ref.child(f"devices/{device_id}/telemetry/history").push(payload)
    except Exception as e:
        logger.debug("RTDB mirror_telemetry failed: %s", e)


def mirror_status(device_id: str, online: bool, last_seen: Optional[str] = None):
    if not init(): return
    try:
        _db_ref.child(f"devices/{device_id}/status").set({"online": online, "last_seen": last_seen})
    except Exception as e:
        logger.debug("RTDB mirror_status failed: %s", e)


def mirror_command(device_id: str, command: Dict[str, Any]):
    if not init(): return
    try:
        _db_ref.child(f"devices/{device_id}/cmd").push(command)
    except Exception as e:
        logger.debug("RTDB mirror_command failed: %s", e)


def mint_custom_token(user_id: str, claims: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Mint a Firebase custom token for the given VaxChain user_id with optional claims."""
    if not init(): return None
    try:
        from firebase_admin import auth as fb_auth
        token = fb_auth.create_custom_token(user_id, claims or {})
        return token.decode("utf-8") if isinstance(token, (bytes, bytearray)) else token
    except Exception as e:
        logger.warning("Firebase mint_custom_token failed: %s", e)
        return None
