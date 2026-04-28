"""VaxChain Monitor backend API tests"""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chill-guard.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Vaccines ----------
class TestVaccines:
    def test_list_vaccines(self, client):
        r = client.get(f"{API}/vaccines", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        ids = {v["id"] for v in data}
        assert {"tetanus", "hepb", "bcg", "hib", "ipv"}.issubset(ids), f"Missing vaccines: {ids}"
        for v in data:
            assert "_id" not in v
            for k in ("k_safe", "k_hot", "Ea_kJ_mol", "min_potency_pct", "name", "platform"):
                assert k in v, f"Missing field {k} in {v}"


# ---------- Sessions ----------
class TestSessions:
    def test_create_session_invalid_vaccine(self, client):
        r = client.post(f"{API}/sessions", json={"vaccine_id": "no_such_vax"}, timeout=30)
        assert r.status_code == 404

    def test_session_full_lifecycle(self, client):
        # create
        r = client.post(f"{API}/sessions", json={
            "vaccine_id": "hepb", "setpoint_c": 5.0, "notes": "TEST_lifecycle"
        }, timeout=30)
        assert r.status_code == 200, r.text
        s = r.json()
        assert "_id" not in s
        assert s["vaccine_id"] == "hepb"
        assert s["vaccine_name"] == "Hepatitis B"
        assert "id" in s and isinstance(s["id"], str)
        sid = s["id"]

        # list
        r = client.get(f"{API}/sessions", timeout=30)
        assert r.status_code == 200
        lst = r.json()
        assert any(x["id"] == sid for x in lst)
        assert all("_id" not in x for x in lst)

        # get one
        r = client.get(f"{API}/sessions/{sid}", timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == sid

        # patch
        ended = datetime.now(timezone.utc).isoformat()
        r = client.patch(f"{API}/sessions/{sid}", json={"ended_at": ended,
            "summary": {"min_temp": 2.1, "max_temp": 7.9}}, timeout=30)
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["ended_at"] == ended
        assert upd["summary"]["max_temp"] == 7.9

        # verify GET reflects update
        r = client.get(f"{API}/sessions/{sid}", timeout=30)
        assert r.json()["ended_at"] == ended

        # 404
        r = client.get(f"{API}/sessions/nonexistent_id", timeout=30)
        assert r.status_code == 404

        return sid

    def test_telemetry_and_alerts(self, client):
        # need a session
        r = client.post(f"{API}/sessions", json={"vaccine_id": "bcg", "notes": "TEST_telem"}, timeout=30)
        assert r.status_code == 200
        sid = r.json()["id"]

        # post batch
        now = datetime.now(timezone.utc)
        points = [{
            "sensor1": 4.5 + i * 0.1,
            "sensor2": 4.6 + i * 0.1,
            "pwm_pct": 40.0,
            "battery_pct": 95.0 - i,
            "lat": 12.97,
            "lng": 77.59,
            "timestamp": now.isoformat(),
        } for i in range(5)]
        r = client.post(f"{API}/sessions/{sid}/telemetry", json={"points": points}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 5

        # empty batch
        r = client.post(f"{API}/sessions/{sid}/telemetry", json={"points": []}, timeout=30)
        assert r.status_code == 200
        assert r.json()["inserted"] == 0

        # GET telemetry - no _id leak
        r = client.get(f"{API}/sessions/{sid}/telemetry", timeout=30)
        assert r.status_code == 200
        tlist = r.json()
        assert len(tlist) >= 5
        for p in tlist:
            assert "_id" not in p
            assert "session_id" not in p
            assert "sensor1" in p

        # create alert
        r = client.post(f"{API}/alerts", json={
            "session_id": sid, "type": "TEMP_BREACH", "severity": "critical",
            "message": "TEST temp out of band", "payload": {"temp": 9.5},
        }, timeout=30)
        assert r.status_code == 200, r.text
        a = r.json()
        assert "_id" not in a
        assert a["dismissed"] is False
        aid = a["id"]

        # list alerts
        r = client.get(f"{API}/sessions/{sid}/alerts", timeout=30)
        assert r.status_code == 200
        alerts = r.json()
        assert any(x["id"] == aid for x in alerts)
        assert all("_id" not in x for x in alerts)

        # dismiss
        r = client.patch(f"{API}/alerts/{aid}/dismiss", timeout=30)
        assert r.status_code == 200
        assert r.json()["dismissed"] is True

        # dismiss unknown
        r = client.patch(f"{API}/alerts/unknown_id/dismiss", timeout=30)
        assert r.status_code == 404
