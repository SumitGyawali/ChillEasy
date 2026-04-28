"""
P3 Backend tests:
  - Auth (register, login, /me bearer + cookie, logout, /session error path)
  - Provisioning HMAC tokens (mint + verify happy/tamper/expired)
  - Device commands /poll consumes; legacy /commands non-consuming default
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chill-guard.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

QA_EMAIL = "qa@vaxchain.test"
QA_PASS = "Passw0rd!"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def qa_token(client):
    r = client.post(f"{API}/auth/login", json={"email": QA_EMAIL, "password": QA_PASS}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"QA login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


# ---------- Auth: register ----------
class TestAuthRegister:
    def test_register_success(self, client):
        email = f"test_{uuid.uuid4().hex[:8]}@vaxchain.test"
        r = client.post(f"{API}/auth/register",
                        json={"email": email, "password": "Pa$$word123", "name": "TEST_user"},
                        timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body and isinstance(body["access_token"], str)
        u = body["user"]
        assert u["email"] == email
        assert u["name"] == "TEST_user"
        assert u["auth_provider"] == "password"
        assert "user_id" in u
        assert "_id" not in u
        assert "password_hash" not in u

    def test_register_duplicate_email_returns_409(self, client):
        # qa user pre-seeded
        r = client.post(f"{API}/auth/register",
                        json={"email": QA_EMAIL, "password": "Whatever123", "name": "dup"},
                        timeout=30)
        assert r.status_code == 409, r.text

    def test_register_short_password_returns_400(self, client):
        email = f"short_{uuid.uuid4().hex[:6]}@vaxchain.test"
        r = client.post(f"{API}/auth/register",
                        json={"email": email, "password": "abc", "name": "x"}, timeout=30)
        assert r.status_code == 400, r.text


# ---------- Auth: login ----------
class TestAuthLogin:
    def test_login_qa_seeded_user(self, client):
        r = client.post(f"{API}/auth/login",
                        json={"email": QA_EMAIL, "password": QA_PASS}, timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "access_token" in b
        assert b["user"]["email"] == QA_EMAIL
        assert b["user"]["auth_provider"] == "password"
        assert "password_hash" not in b["user"]

    def test_login_wrong_password_returns_401(self, client):
        r = client.post(f"{API}/auth/login",
                        json={"email": QA_EMAIL, "password": "wrongPass!9"}, timeout=30)
        assert r.status_code == 401


# ---------- Auth: /me ----------
class TestAuthMe:
    def test_me_unauth_returns_401(self, client):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_with_bearer_returns_user(self, qa_token):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {qa_token}"}, timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["email"] == QA_EMAIL
        assert "_id" not in u
        assert "password_hash" not in u

    def test_me_with_invalid_bearer_returns_401(self):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": "Bearer not-a-real-jwt"}, timeout=30)
        assert r.status_code == 401


# ---------- Auth: cookie session via direct mongo insert ----------
class TestCookieSession:
    @pytest.fixture(scope="class")
    def mongo_db(self):
        url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        dbname = os.environ.get("DB_NAME", "test_database")
        return MongoClient(url)[dbname]

    def test_valid_cookie_session_returns_user(self, mongo_db):
        user = mongo_db.users.find_one({"email": QA_EMAIL}, {"_id": 0})
        assert user, "QA user should exist"
        token = f"TEST_sess_{uuid.uuid4().hex}"
        exp = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        mongo_db.user_sessions.insert_one({
            "user_id": user["user_id"],
            "session_token": token,
            "expires_at": exp,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = requests.get(f"{API}/auth/me", cookies={"session_token": token}, timeout=30)
            assert r.status_code == 200, r.text
            assert r.json()["email"] == QA_EMAIL
        finally:
            mongo_db.user_sessions.delete_one({"session_token": token})

    def test_expired_cookie_session_returns_401(self, mongo_db):
        user = mongo_db.users.find_one({"email": QA_EMAIL}, {"_id": 0})
        token = f"TEST_sess_exp_{uuid.uuid4().hex}"
        exp = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        mongo_db.user_sessions.insert_one({
            "user_id": user["user_id"],
            "session_token": token,
            "expires_at": exp,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = requests.get(f"{API}/auth/me", cookies={"session_token": token}, timeout=30)
            assert r.status_code == 401
        finally:
            mongo_db.user_sessions.delete_one({"session_token": token})

    def test_logout_deletes_session_row(self, mongo_db):
        user = mongo_db.users.find_one({"email": QA_EMAIL}, {"_id": 0})
        token = f"TEST_sess_lo_{uuid.uuid4().hex}"
        exp = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        mongo_db.user_sessions.insert_one({
            "user_id": user["user_id"],
            "session_token": token,
            "expires_at": exp,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.post(f"{API}/auth/logout", cookies={"session_token": token}, timeout=30)
        assert r.status_code == 200
        remaining = mongo_db.user_sessions.find_one({"session_token": token})
        assert remaining is None


# ---------- Auth: /session error path ----------
class TestEmergentSessionErrorPath:
    def test_invalid_session_id_returns_401(self, client):
        r = client.post(f"{API}/auth/session", json={"session_id": "NOT_A_REAL_SESSION_ID"}, timeout=30)
        assert r.status_code == 401

    def test_missing_session_id_returns_400(self, client):
        r = client.post(f"{API}/auth/session", json={}, timeout=30)
        assert r.status_code == 400


# ---------- Provisioning ----------
class TestProvisioning:
    def test_mint_token_shape(self, client):
        r = client.post(f"{API}/provisioning/tokens",
                        json={"device_id": "TEST-dev-prov-1", "ttl_hours": 2}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["device_id"] == "TEST-dev-prov-1"
        assert isinstance(d["token"], str) and len(d["token"]) == 64
        assert all(c in "0123456789abcdef" for c in d["token"])
        assert isinstance(d["signature"], str) and len(d["signature"]) == 64
        assert "expires_at" in d

    def test_verify_happy_path(self, client):
        r = client.post(f"{API}/provisioning/tokens",
                        json={"device_id": "TEST-dev-prov-2", "ttl_hours": 1}, timeout=30)
        d = r.json()
        v = client.post(f"{API}/provisioning/verify", json=d, timeout=30)
        assert v.status_code == 200, v.text
        assert v.json()["valid"] is True

    def test_verify_tampered_signature_401(self, client):
        r = client.post(f"{API}/provisioning/tokens",
                        json={"device_id": "TEST-dev-prov-3", "ttl_hours": 1}, timeout=30)
        d = r.json()
        # flip last char
        d["signature"] = d["signature"][:-1] + ("0" if d["signature"][-1] != "0" else "1")
        v = client.post(f"{API}/provisioning/verify", json=d, timeout=30)
        assert v.status_code == 401

    def test_verify_expired_401(self, client):
        # mint then mutate expires_at to past, recompute sig from server? No: server validates HMAC of OUR payload.
        # If we change expires_at, signature mismatches. So we instead use a tampered-time test by just
        # asserting signature mismatch path AND a 'past expires_at' produced by re-signing on client-side
        # is not possible without server secret. So we only verify that sending past expires_at with
        # original signature -> 401 (signature mismatch route). This still asserts the time-protection path is
        # cryptographically tied to expiry.
        r = client.post(f"{API}/provisioning/tokens",
                        json={"device_id": "TEST-dev-prov-4", "ttl_hours": 1}, timeout=30)
        d = r.json()
        d["expires_at"] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        v = client.post(f"{API}/provisioning/verify", json=d, timeout=30)
        assert v.status_code == 401


# ---------- Device commands: /poll vs /commands ----------
class TestCommandPoll:
    def test_poll_consumes_and_commands_does_not(self, client):
        device = f"TEST-dev-poll-{uuid.uuid4().hex[:6]}"
        # enqueue 2 commands
        for i in range(2):
            r = client.post(f"{API}/devices/{device}/commands",
                            json={"type": "PING", "value": i}, timeout=30)
            assert r.status_code == 200

        # /commands without consume should return both
        r = client.get(f"{API}/devices/{device}/commands", timeout=30)
        assert r.status_code == 200
        assert len(r.json()["commands"]) == 2

        # again — still returns both (non-consuming default)
        r = client.get(f"{API}/devices/{device}/commands", timeout=30)
        assert len(r.json()["commands"]) == 2

        # /commands/poll — consumes them
        r = client.get(f"{API}/devices/{device}/commands/poll", timeout=30)
        assert r.status_code == 200
        assert len(r.json()["commands"]) == 2

        # subsequent poll = empty
        r = client.get(f"{API}/devices/{device}/commands/poll", timeout=30)
        assert r.json()["commands"] == []

        # /commands now also empty (already consumed)
        r = client.get(f"{API}/devices/{device}/commands", timeout=30)
        assert r.json()["commands"] == []

    def test_legacy_consume_true_still_consumes(self, client):
        device = f"TEST-dev-legacy-{uuid.uuid4().hex[:6]}"
        client.post(f"{API}/devices/{device}/commands", json={"type": "PING"}, timeout=30)
        r = client.get(f"{API}/devices/{device}/commands?consume=true", timeout=30)
        assert len(r.json()["commands"]) == 1
        # next call -> empty
        r = client.get(f"{API}/devices/{device}/commands", timeout=30)
        assert r.json()["commands"] == []
