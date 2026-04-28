"""Backend tests for new NodeMCU device ingest + commands endpoints."""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chill-guard.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def device_id():
    return f"TEST-dev-{uuid.uuid4().hex[:8]}"


def _point(ts=None, sensor1=4.0, sensor2=4.1, lat=12.97, lng=77.59, session_id=None):
    p = {
        "sensor1": sensor1,
        "sensor2": sensor2,
        "pwm_pct": 30.0,
        "battery_pct": 88.0,
        "lat": lat,
        "lng": lng,
    }
    if ts:
        p["timestamp"] = ts
    if session_id:
        p["session_id"] = session_id
    return p


# ---------- Ingest ----------
class TestIngest:
    def test_ingest_basic_and_telemetry_get(self, client, device_id):
        # Ingest 3 points with explicit timestamps
        base = datetime.now(timezone.utc)
        for i in range(3):
            ts = (base + timedelta(seconds=i)).isoformat()
            r = client.post(f"{API}/ingest/{device_id}",
                            json=_point(ts=ts, sensor1=4 + i * 0.5),
                            timeout=30)
            assert r.status_code == 200, r.text
            assert r.json() == {"ok": True}

        # GET telemetry: ascending by timestamp, no _id leak, no device_id leak
        r = client.get(f"{API}/devices/{device_id}/telemetry", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 3
        for p in data:
            assert "_id" not in p
            assert "device_id" not in p
            for k in ("sensor1", "sensor2", "pwm_pct", "battery_pct", "lat", "lng", "timestamp"):
                assert k in p
        ts_values = [p["timestamp"] for p in data]
        assert ts_values == sorted(ts_values), "Telemetry should be ascending by timestamp"

    def test_ingest_default_timestamp(self, client, device_id):
        # Omit timestamp - server should populate
        r = client.post(f"{API}/ingest/{device_id}", json=_point(), timeout=30)
        assert r.status_code == 200
        r = client.get(f"{API}/devices/{device_id}/telemetry", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["timestamp"]  # not empty

    def test_ingest_updates_last_seen_and_status(self, client, device_id):
        ts = datetime.now(timezone.utc).isoformat()
        r = client.post(f"{API}/ingest/{device_id}", json=_point(ts=ts), timeout=30)
        assert r.status_code == 200

        r = client.get(f"{API}/devices/{device_id}/status", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["device_id"] == device_id
        assert body["online"] is True, body
        assert body["info"] is not None
        assert body["info"]["id"] == device_id
        assert body["info"]["last_seen"] == ts
        assert "_id" not in body["info"]
        assert body["pending_commands"] == 0

    def test_ingest_mirrors_to_session_telemetry(self, client, device_id):
        # Create a session
        r = client.post(f"{API}/sessions",
                        json={"vaccine_id": "ipv", "notes": "TEST_mirror"},
                        timeout=30)
        assert r.status_code == 200
        sid = r.json()["id"]

        ts = datetime.now(timezone.utc).isoformat()
        r = client.post(f"{API}/ingest/{device_id}",
                        json=_point(ts=ts, sensor1=6.6, session_id=sid),
                        timeout=30)
        assert r.status_code == 200

        # Verify mirror via session telemetry endpoint
        r = client.get(f"{API}/sessions/{sid}/telemetry", timeout=30)
        assert r.status_code == 200
        pts = r.json()
        assert any(abs(p["sensor1"] - 6.6) < 1e-6 for p in pts), pts


# ---------- Commands ----------
class TestCommands:
    def test_enqueue_and_consume(self, client, device_id):
        # Enqueue 2 commands
        r1 = client.post(f"{API}/devices/{device_id}/commands",
                         json={"type": "setpoint", "value": 4.0}, timeout=30)
        assert r1.status_code == 200
        b1 = r1.json()
        assert b1["queued"] is True
        assert isinstance(b1["id"], str) and len(b1["id"]) > 0

        r2 = client.post(f"{API}/devices/{device_id}/commands",
                         json={"type": "excursion_test"}, timeout=30)
        assert r2.status_code == 200

        # consume=false: list pending without marking consumed
        r = client.get(f"{API}/devices/{device_id}/commands?consume=false", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "commands" in data
        cmds = data["commands"]
        assert len(cmds) >= 2
        types = [c["type"] for c in cmds]
        assert "setpoint" in types and "excursion_test" in types
        for c in cmds:
            assert "_id" not in c

        # status reflects pending count
        r = client.get(f"{API}/devices/{device_id}/status", timeout=30)
        assert r.json()["pending_commands"] >= 2

        # consume=true (default): returns then marks consumed
        r = client.get(f"{API}/devices/{device_id}/commands", timeout=30)
        assert r.status_code == 200
        first = r.json()["commands"]
        assert len(first) >= 2

        # second poll should return empty
        r = client.get(f"{API}/devices/{device_id}/commands", timeout=30)
        assert r.status_code == 200
        assert r.json()["commands"] == []

        # status pending should be 0 now
        r = client.get(f"{API}/devices/{device_id}/status", timeout=30)
        assert r.json()["pending_commands"] == 0


# ---------- Status when device unknown ----------
class TestStatus:
    def test_status_unknown_device(self, client):
        unknown = f"TEST-unknown-{uuid.uuid4().hex[:6]}"
        r = client.get(f"{API}/devices/{unknown}/status", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["device_id"] == unknown
        assert body["online"] is False
        assert body["info"] in (None, {})
        assert body["pending_commands"] == 0
