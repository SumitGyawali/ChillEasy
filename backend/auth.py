"""
VaxChain auth: dual-mode.
  - Email/password (JWT Bearer)
  - Emergent-managed Google OAuth (httpOnly session_token cookie)

Single users collection serves both providers.
"""
import os
import uuid
import hmac
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
import bcrypt
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Cookie, Header
from pydantic import BaseModel, EmailStr, ConfigDict, Field

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-prod")
JWT_ALGO = "HS256"
JWT_TTL_DAYS = 14
EMERGENT_OAUTH_BASE = os.environ.get("EMERGENT_OAUTH_BASE", "https://demobackend.emergentagent.com/auth/v1/env")
PROVISIONING_SECRET = os.environ.get("PROVISIONING_SECRET", "change-me-prov-secret")

auth_router = APIRouter(prefix="/api/auth")


# ===================== Models =====================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    auth_provider: str = "password"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RegisterPayload(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginPayload(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


# ===================== Helpers =====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def issue_jwt(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "iat": int(now.timestamp()), "exp": int((now + timedelta(days=JWT_TTL_DAYS)).timestamp())},
        JWT_SECRET, algorithm=JWT_ALGO,
    )


def decode_jwt(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get("sub")
    except Exception:
        return None


def hmac_sign(payload: str) -> str:
    return hmac.new(PROVISIONING_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


# ===================== get_current_user =====================

def make_auth_dep(db, required: bool = True):
    async def get_current_user(
        request: Request,
        session_token: Optional[str] = Cookie(default=None),
        authorization: Optional[str] = Header(default=None),
    ) -> Optional[User]:
        # 1) Cookie session (Emergent)
        if session_token:
            sess = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
            if sess:
                exp = sess.get("expires_at")
                if isinstance(exp, str):
                    exp = datetime.fromisoformat(exp)
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp >= datetime.now(timezone.utc):
                    u = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
                    if u: return User(**u)

        # 2) Bearer JWT
        if authorization and authorization.lower().startswith("bearer "):
            token = authorization[7:]
            user_id = decode_jwt(token)
            if user_id:
                u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
                if u: return User(**u)

        if required:
            raise HTTPException(401, "Not authenticated")
        return None
    return get_current_user


# ===================== Routes (mounted with db dependency) =====================

def build_auth_router(db):
    auth_dep_required = make_auth_dep(db, required=True)

    @auth_router.post("/register", response_model=TokenResponse)
    async def register(payload: RegisterPayload):
        existing = await db.users.find_one({"email": payload.email.lower()})
        if existing:
            raise HTTPException(409, "Email already registered")
        if len(payload.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        doc = {
            "user_id": user_id,
            "email": payload.email.lower(),
            "name": payload.name or payload.email.split("@")[0],
            "picture": None,
            "auth_provider": "password",
            "password_hash": hash_password(payload.password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(doc)
        u = User(**{k: v for k, v in doc.items() if k != "password_hash"})
        return TokenResponse(access_token=issue_jwt(user_id), user=u)

    @auth_router.post("/login", response_model=TokenResponse)
    async def login(payload: LoginPayload):
        u = await db.users.find_one({"email": payload.email.lower()})
        if not u or not u.get("password_hash"):
            raise HTTPException(401, "Invalid credentials")
        if not verify_password(payload.password, u["password_hash"]):
            raise HTTPException(401, "Invalid credentials")
        user = User(**{k: v for k, v in u.items() if k not in ("_id", "password_hash")})
        return TokenResponse(access_token=issue_jwt(user.user_id), user=user)

    @auth_router.post("/session")
    async def emergent_session(request: Request, response: Response):
        """Exchange Emergent session_id (URL fragment) for our session cookie + user record."""
        body = await request.json()
        session_id = body.get("session_id")
        if not session_id:
            raise HTTPException(400, "session_id required")
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.get(
                f"{EMERGENT_OAUTH_BASE}/oauth/session-data",
                headers={"X-Session-ID": session_id},
            )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Emergent session")
        data = r.json()
        email = (data.get("email") or "").lower()
        if not email:
            raise HTTPException(400, "Emergent payload missing email")

        # Upsert user
        existing = await db.users.find_one({"email": email}, {"_id": 0})
        if existing:
            user_id = existing["user_id"]
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {
                    "name": data.get("name") or existing.get("name"),
                    "picture": data.get("picture") or existing.get("picture"),
                    "auth_provider": existing.get("auth_provider") or "google",
                }},
            )
        else:
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            await db.users.insert_one({
                "user_id": user_id,
                "email": email,
                "name": data.get("name"),
                "picture": data.get("picture"),
                "auth_provider": "google",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        session_token = data.get("session_token") or secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        await db.user_sessions.insert_one({
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        response.set_cookie(
            key="session_token", value=session_token,
            httponly=True, secure=True, samesite="none", path="/",
            max_age=7 * 24 * 3600,
        )
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        return {"user": u}

    @auth_router.get("/me", response_model=User)
    async def me(user: User = Depends(auth_dep_required)):
        return user

    @auth_router.post("/logout")
    async def logout(response: Response, session_token: Optional[str] = Cookie(default=None)):
        if session_token:
            await db.user_sessions.delete_one({"session_token": session_token})
        response.delete_cookie("session_token", path="/")
        return {"ok": True}

    return auth_router


# ===================== Provisioning tokens (HMAC-signed) =====================

provisioning_router = APIRouter(prefix="/api/provisioning")


class ProvisionRequest(BaseModel):
    device_id: str
    ttl_hours: int = 24


class ProvisionResponse(BaseModel):
    device_id: str
    token: str
    signature: str
    expires_at: str


@provisioning_router.post("/tokens", response_model=ProvisionResponse)
async def mint_token(req: ProvisionRequest):
    """Mint a 256-bit random token + HMAC signature tying device_id + expiry.
    The NodeMCU stores the token; the backend verifies signatures on first connect."""
    raw = secrets.token_hex(32)  # 256-bit
    expires = (datetime.now(timezone.utc) + timedelta(hours=max(1, min(req.ttl_hours, 720)))).isoformat()
    payload = f"{req.device_id}|{raw}|{expires}"
    sig = hmac_sign(payload)
    return ProvisionResponse(device_id=req.device_id, token=raw, signature=sig, expires_at=expires)


class VerifyRequest(BaseModel):
    device_id: str
    token: str
    signature: str
    expires_at: str


@provisioning_router.post("/verify")
async def verify_token(req: VerifyRequest):
    payload = f"{req.device_id}|{req.token}|{req.expires_at}"
    expected = hmac_sign(payload)
    if not hmac.compare_digest(expected, req.signature):
        raise HTTPException(401, "Invalid signature")
    exp = datetime.fromisoformat(req.expires_at)
    if exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(401, "Token expired")
    return {"valid": True, "device_id": req.device_id}
