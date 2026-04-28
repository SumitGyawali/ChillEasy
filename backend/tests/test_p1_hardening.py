"""P1 hardening tests: SessionUpdate whitelist, telemetry pagination, indexes."""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def session_id(client):
    r = client.post(f"{API}/sessions", json={"vaccine_id": "tetanus", "notes": "TEST_p1"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------- PATCH /api/sessions/{id} whitelist ----------
class TestSessionPatchWhitelist:
    def test_extra_field_rejected_422(self, client, session_id):
        # Non-whitelisted field should yield 422 due to extra='forbid'
        r = client.patch(f"{API}/sessions/{session_id}",
                         json={"vaccine_id": "hacked", "notes": "x"}, timeout=30)
        assert r.status_code == 422, r.text
        body = r.json()
        # FastAPI/Pydantic v2 returns 'detail' list with type 'extra_forbidden'
        types = [e.get("type") for e in body.get("detail", [])]
        assert any("extra" in (t or "") for t in types), body

    def test_whitelisted_fields_apply(self, client, session_id):
        ended = datetime.now(timezone.utc).isoformat()
        payload = {
            "ended_at": ended,
            "notes": "TEST_p1_whitelisted",
            "summary": {"avg": 5.1},
            "destination": {"lat": 12.97, "lng": 77.59},
        }
        r = client.patch(f"{API}/sessions/{session_id}", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["ended_at"] == ended
        assert upd["notes"] == "TEST_p1_whitelisted"
        assert upd["summary"]["avg"] == 5.1
        assert upd["destination"]["lat"] == 12.97

        # Verify persistence via GET
        r = client.get(f"{API}/sessions/{session_id}", timeout=30)
        assert r.status_code == 200
        g = r.json()
        assert g["notes"] == "TEST_p1_whitelisted"
        assert g["destination"]["lng"] == 77.59

    def test_empty_patch_returns_400(self, client, session_id):
        r = client.patch(f"{API}/sessions/{session_id}", json={}, timeout=30)
        assert r.status_code == 400, r.text


# ---------- GET /api/sessions/{id}/telemetry pagination ----------
class TestTelemetryPagination:
    def test_since_until_limit_skip(self, client):
        # Create dedicated session
        r = client.post(f"{API}/sessions", json={"vaccine_id": "hib", "notes": "TEST_paginate"}, timeout=30)
        assert r.status_code == 200
        sid = r.json()["id"]

        # Insert 3 distinct timestamped points
        base = datetime.now(timezone.utc)
        ts = [(base + timedelta(seconds=i)).isoformat() for i in range(3)]
        points = [
            {"sensor1": 5.1, "sensor2": 5.0, "pwm_pct": 30.0, "battery_pct": 90, "lat": 12.9, "lng": 77.5, "timestamp": ts[0]},
            {"sensor1": 5.3, "sensor2": 5.2, "pwm_pct": 30.0, "battery_pct": 89, "lat": 12.9, "lng": 77.5, "timestamp": ts[1]},
            {"sensor1": 5.5, "sensor2": 5.4, "pwm_pct": 30.0, "battery_pct": 88, "lat": 12.9, "lng": 77.5, "timestamp": ts[2]},
        ]
        r = client.post(f"{API}/sessions/{sid}/telemetry", json={"points": points}, timeout=30)
        assert r.status_code == 200 and r.json()["inserted"] == 3

        # full GET ascending
        r = client.get(f"{API}/sessions/{sid}/telemetry", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 3
        ts_returned = [p["timestamp"] for p in data]
        assert ts_returned == sorted(ts_returned), "Should be ascending by timestamp"
        assert abs(data[0]["sensor1"] - 5.1) < 1e-6
        assert abs(data[2]["sensor1"] - 5.5) < 1e-6

        # limit=1 skip=1 -> middle point
        r = client.get(f"{API}/sessions/{sid}/telemetry", params={"limit": 1, "skip": 1}, timeout=30)
        assert r.status_code == 200
        mid = r.json()
        assert len(mid) == 1
        assert abs(mid[0]["sensor1"] - 5.3) < 1e-6, mid

        # since/until window includes only middle
        r = client.get(f"{API}/sessions/{sid}/telemetry",
                       params={"since": ts[1], "until": ts[1]}, timeout=30)
        assert r.status_code == 200
        win = r.json()
        assert len(win) == 1
        assert abs(win[0]["sensor1"] - 5.3) < 1e-6

        # since=ts[1] returns last 2 ascending
        r = client.get(f"{API}/sessions/{sid}/telemetry", params={"since": ts[1]}, timeout=30)
        assert r.status_code == 200
        tail = r.json()
        assert len(tail) == 2
        assert abs(tail[0]["sensor1"] - 5.3) < 1e-6
        assert abs(tail[1]["sensor1"] - 5.5) < 1e-6


# ---------- Mongo indexes from lifespan ----------
@pytest.mark.skipif(not (MONGO_URL and DB_NAME), reason="MONGO_URL/DB_NAME not set")
class TestIndexes:
    @pytest.fixture(scope="class")
    def db(self):
        c = MongoClient(MONGO_URL)
        yield c[DB_NAME]
        c.close()

    def test_telemetry_index(self, db):
        idx = db.telemetry.index_information()
        assert "session_id_1_timestamp_1" in idx, list(idx.keys())

    def test_alerts_index(self, db):
        idx = db.alerts.index_information()
        assert "session_id_1_timestamp_-1" in idx, list(idx.keys())

    def test_sessions_index(self, db):
        idx = db.sessions.index_information()
        assert "started_at_-1" in idx, list(idx.keys())

    def test_device_telemetry_index(self, db):
        idx = db.device_telemetry.index_information()
        assert "device_id_1_timestamp_-1" in idx, list(idx.keys())

    def test_device_commands_index(self, db):
        idx = db.device_commands.index_information()
        assert "device_id_1_consumed_1_created_at_1" in idx, list(idx.keys())

    def test_devices_id_unique(self, db):
        idx = db.devices.index_information()
        assert "id_1" in idx, list(idx.keys())
        assert idx["id_1"].get("unique") is True, idx["id_1"]
