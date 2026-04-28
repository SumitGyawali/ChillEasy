"""Iteration 6 — Firebase custom-token endpoint + bridge graceful no-op tests.

Asserts:
  - POST /api/firebase/token without auth -> 401
  - POST /api/firebase/token with VaxChain JWT but no FIREBASE_SERVICE_ACCOUNT_JSON -> 503
  - POST /api/firebase/token with cookie session -> 503 (auth resolves via cookie path)
  - /api/ingest/{id} still succeeds (200) when bridge is no-op AND writes to Mongo device_telemetry
  - /api/devices/{id}/commands still succeeds (200) when bridge is no-op AND writes to Mongo device_commands
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

QA_EMAIL = "qa@vaxchain.test"
QA_PASSWORD = "Passw0rd!"


@pytest.fixture(scope="module")
def jwt_token():
    r = requests.post(f"{API}/auth/login", json={"email": QA_EMAIL, "password": QA_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def mongo_db():
    return MongoClient(MONGO_URL)[DB_NAME]


# ---------- /api/firebase/token ----------
class TestFirebaseToken:
    def test_token_without_auth_returns_401(self):
        r = requests.post(f"{API}/firebase/token", timeout=30)
        assert r.status_code == 401, r.text

    def test_token_with_jwt_returns_503_when_sa_missing(self, jwt_token):
        r = requests.post(
            f"{API}/firebase/token",
            headers={"Authorization": f"Bearer {jwt_token}"},
            timeout=30,
        )
        assert r.status_code == 503, r.text
        body = r.json()
        assert "firebase" in (body.get("detail", "") or "").lower(), body

    def test_token_with_cookie_session_returns_503_when_sa_missing(self, jwt_token, mongo_db):
        # Resolve user_id from JWT-issued /api/auth/me
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {jwt_token}"}, timeout=30)
        assert me.status_code == 200, me.text
        user_id = me.json()["user_id"]

        # Hand-seed a user_sessions row mirroring Emergent-OAuth cookie path
        token = f"TEST_cookie_{uuid.uuid4().hex}"
        expires = datetime.now(timezone.utc) + timedelta(days=1)
        mongo_db.user_sessions.insert_one({
            "session_token": token,
            "user_id": user_id,
            "email": QA_EMAIL,
            "created_at": datetime.now(timezone.utc),
            "expires_at": expires,
        })
        try:
            r = requests.post(
                f"{API}/firebase/token",
                cookies={"session_token": token},
                timeout=30,
            )
            # cookie auth path resolves; bridge not configured -> 503
            assert r.status_code == 503, r.text
        finally:
            mongo_db.user_sessions.delete_one({"session_token": token})


# ---------- bridge graceful no-op on /ingest and /commands ----------
class TestBridgeGracefulNoop:
    def test_ingest_succeeds_and_persists_when_bridge_noop(self, mongo_db):
        device_id = f"TEST_bridge_dev_{uuid.uuid4().hex[:8]}"
        payload = {
            "sensor1": 4.2,
            "sensor2": 4.4,
            "pwm_pct": 50.0,
            "battery_pct": 90.0,
            "lat": 12.97,
            "lng": 77.59,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        r = requests.post(f"{API}/ingest/{device_id}", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True, body

        # Verify Mongo write happened despite bridge being no-op
        doc = mongo_db.device_telemetry.find_one({"device_id": device_id})
        assert doc is not None
        assert doc["sensor1"] == 4.2

        # Cleanup
        mongo_db.device_telemetry.delete_many({"device_id": device_id})
        mongo_db.devices.delete_many({"id": device_id})

    def test_command_enqueue_succeeds_and_persists_when_bridge_noop(self, jwt_token, mongo_db):
        device_id = f"TEST_bridge_dev_{uuid.uuid4().hex[:8]}"
        cmd = {"type": "setpoint", "value": 5}
        r = requests.post(
            f"{API}/devices/{device_id}/commands",
            json=cmd,
            headers={"Authorization": f"Bearer {jwt_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("queued") is True or "id" in body, body
        cmd_id = body.get("id")
        assert cmd_id, body

        # Verify Mongo write
        doc = mongo_db.device_commands.find_one({"id": cmd_id})
        assert doc is not None
        assert doc["type"] == "setpoint"
        assert doc["value"] == 5
        assert doc["device_id"] == device_id

        # Cleanup
        mongo_db.device_commands.delete_many({"device_id": device_id})

    def test_no_5xx_when_bridge_is_noop(self):
        """Smoke: verify bridge no-op never raises 5xx under repeated ingest."""
        device_id = f"TEST_bridge_smoke_{uuid.uuid4().hex[:8]}"
        for i in range(3):
            r = requests.post(
                f"{API}/ingest/{device_id}",
                json={"sensor1": 3.0 + i, "sensor2": 3.5 + i, "pwm_pct": 40.0, "battery_pct": 80.0, "lat": 0.0, "lng": 0.0},
                timeout=30,
            )
            assert r.status_code < 500, r.text
            assert r.status_code == 200, r.text
        # Cleanup
        db = MongoClient(MONGO_URL)[DB_NAME]
        db.device_telemetry.delete_many({"device_id": device_id})
        db.devices.delete_many({"id": device_id})
