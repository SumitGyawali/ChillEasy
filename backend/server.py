from fastapi import FastAPI, APIRouter, HTTPException
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


# ===================== Models =====================

class Vaccine(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    platform: str
    k_safe: float
    k_hot: float
    Ea_kJ_mol: float
    min_potency_pct: float


class TelemetryPoint(BaseModel):
    model_config = ConfigDict(extra="ignore")
    sensor1: float
    sensor2: float
    pwm_pct: float
    battery_pct: float
    lat: float
    lng: float
    timestamp: str  # ISO8601


class TelemetryBatch(BaseModel):
    points: List[TelemetryPoint]


class SessionCreate(BaseModel):
    vaccine_id: str
    setpoint_c: float = 5.0
    destination: Optional[Dict[str, float]] = None
    notes: Optional[str] = None


class Session(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vaccine_id: str
    vaccine_name: Optional[str] = None
    setpoint_c: float = 5.0
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    ended_at: Optional[str] = None
    destination: Optional[Dict[str, float]] = None
    notes: Optional[str] = None
    summary: Optional[Dict[str, Any]] = None


class SessionUpdate(BaseModel):
    """Whitelisted fields the client can update on an existing session."""
    model_config = ConfigDict(extra="forbid")
    ended_at: Optional[str] = None
    notes: Optional[str] = None
    summary: Optional[Dict[str, Any]] = None
    destination: Optional[Dict[str, float]] = None


class AlertItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    type: str
    severity: str
    message: str
    payload: Optional[Dict[str, Any]] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    dismissed: bool = False


class AlertCreate(BaseModel):
    session_id: str
    type: str
    severity: str
    message: str
    payload: Optional[Dict[str, Any]] = None


class DeviceCommand(BaseModel):
    type: str
    value: Optional[Any] = None


class IngestPayload(BaseModel):
    sensor1: float
    sensor2: float
    pwm_pct: float
    battery_pct: float
    lat: float
    lng: float
    timestamp: Optional[str] = None
    session_id: Optional[str] = None


# ===================== Vaccines seed =====================

DEFAULT_VACCINES = [
    {"id": "tetanus", "name": "Tetanus Toxoid", "platform": "Toxoid",
     "k_safe": 0.001, "k_hot": 0.055, "Ea_kJ_mol": 85, "min_potency_pct": 80},
    {"id": "hepb", "name": "Hepatitis B", "platform": "Recombinant subunit",
     "k_safe": 0.002, "k_hot": 0.060, "Ea_kJ_mol": 90, "min_potency_pct": 80},
    {"id": "bcg", "name": "BCG", "platform": "Live-attenuated",
     "k_safe": 0.005, "k_hot": 0.120, "Ea_kJ_mol": 105, "min_potency_pct": 80},
    {"id": "hib", "name": "Hib Polysaccharide", "platform": "Polysaccharide",
     "k_safe": 0.003, "k_hot": 0.100, "Ea_kJ_mol": 95, "min_potency_pct": 80},
    {"id": "ipv", "name": "Inactivated Polio (IPV)", "platform": "Inactivated virus",
     "k_safe": 0.001, "k_hot": 0.040, "Ea_kJ_mol": 80, "min_potency_pct": 80},
]


# ===================== Lifespan: seeding + indexes =====================

@asynccontextmanager
async def lifespan(_: FastAPI):
    if await db.vaccines.count_documents({}) == 0:
        await db.vaccines.insert_many([dict(v) for v in DEFAULT_VACCINES])
    # Seed QA test user (idempotent)
    if not await db.users.find_one({"email": "qa@vaxchain.test"}):
        from auth import hash_password
        import uuid as _uuid
        await db.users.insert_one({
            "user_id": f"user_{_uuid.uuid4().hex[:12]}",
            "email": "qa@vaxchain.test",
            "name": "QA",
            "auth_provider": "password",
            "password_hash": hash_password("Passw0rd!"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await db.telemetry.create_index([("session_id", 1), ("timestamp", 1)])
    await db.alerts.create_index([("session_id", 1), ("timestamp", -1)])
    await db.sessions.create_index([("started_at", -1)])
    await db.device_telemetry.create_index([("device_id", 1), ("timestamp", -1)])
    await db.device_commands.create_index([("device_id", 1), ("consumed", 1), ("created_at", 1)])
    await db.devices.create_index([("id", 1)], unique=True)
    await db.users.create_index([("email", 1)], unique=True)
    await db.user_sessions.create_index([("session_token", 1)], unique=True)
    yield
    client.close()


app = FastAPI(title="VaxChain Monitor API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# Auth + provisioning
from auth import build_auth_router, provisioning_router
app.include_router(build_auth_router(db))
app.include_router(provisioning_router)


# ===================== Routes =====================

@api_router.get("/")
async def root():
    return {"service": "VaxChain Monitor", "status": "ok"}


@api_router.get("/vaccines", response_model=List[Vaccine])
async def list_vaccines():
    return await db.vaccines.find({}, {"_id": 0}).to_list(100)


@api_router.post("/sessions", response_model=Session)
async def create_session(payload: SessionCreate):
    vaccine = await db.vaccines.find_one({"id": payload.vaccine_id}, {"_id": 0})
    if not vaccine:
        raise HTTPException(404, "Vaccine not found")
    s = Session(
        vaccine_id=payload.vaccine_id,
        vaccine_name=vaccine["name"],
        setpoint_c=payload.setpoint_c,
        destination=payload.destination,
        notes=payload.notes,
    )
    await db.sessions.insert_one(s.model_dump())
    return s


@api_router.get("/sessions", response_model=List[Session])
async def list_sessions(limit: int = 200):
    return await db.sessions.find({}, {"_id": 0}).sort("started_at", -1).to_list(limit)


@api_router.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@api_router.patch("/sessions/{session_id}", response_model=Session)
async def update_session(session_id: str, update: SessionUpdate):
    patch = {k: v for k, v in update.model_dump(exclude_unset=True).items() if v is not None}
    if not patch:
        raise HTTPException(400, "No updatable fields provided")
    res = await db.sessions.find_one_and_update(
        {"id": session_id}, {"$set": patch},
        return_document=True, projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Session not found")
    return res


@api_router.post("/sessions/{session_id}/telemetry")
async def append_telemetry(session_id: str, batch: TelemetryBatch):
    if not batch.points:
        return {"inserted": 0}
    docs = [{**p.model_dump(), "session_id": session_id} for p in batch.points]
    await db.telemetry.insert_many(docs)
    return {"inserted": len(docs)}


@api_router.get("/sessions/{session_id}/telemetry", response_model=List[TelemetryPoint])
async def get_telemetry(
    session_id: str,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = 1000,
    skip: int = 0,
):
    """Paginated, time-window query. Use since/until for windows; limit/skip for offsets."""
    q: Dict[str, Any] = {"session_id": session_id}
    if since or until:
        q["timestamp"] = {}
        if since: q["timestamp"]["$gte"] = since
        if until: q["timestamp"]["$lte"] = until
    cursor = db.telemetry.find(q, {"_id": 0, "session_id": 0}).sort("timestamp", 1).skip(skip).limit(min(limit, 5000))
    return await cursor.to_list(min(limit, 5000))


@api_router.post("/alerts", response_model=AlertItem)
async def create_alert(payload: AlertCreate):
    a = AlertItem(**payload.model_dump())
    await db.alerts.insert_one(a.model_dump())
    return a


@api_router.get("/sessions/{session_id}/alerts", response_model=List[AlertItem])
async def list_alerts(session_id: str):
    return await db.alerts.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", -1).to_list(500)


@api_router.patch("/alerts/{alert_id}/dismiss")
async def dismiss_alert(alert_id: str):
    res = await db.alerts.find_one_and_update(
        {"id": alert_id}, {"$set": {"dismissed": True}},
        return_document=True, projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Alert not found")
    return res


# ===================== Device ingest + commands =====================

@api_router.post("/ingest/{device_id}")
async def ingest_device(device_id: str, payload: IngestPayload):
    doc = payload.model_dump()
    doc["device_id"] = device_id
    if not doc.get("timestamp"):
        doc["timestamp"] = datetime.now(timezone.utc).isoformat()
    await db.device_telemetry.insert_one(doc)
    if doc.get("session_id"):
        sdoc = {k: v for k, v in doc.items() if k != "device_id"}
        await db.telemetry.insert_one(sdoc)
    await db.devices.update_one(
        {"id": device_id},
        {"$set": {"id": device_id, "last_seen": doc["timestamp"], "last_payload": payload.model_dump()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/devices/{device_id}/telemetry", response_model=List[IngestPayload])
async def device_telemetry(device_id: str, limit: int = 500):
    docs = await db.device_telemetry.find(
        {"device_id": device_id}, {"_id": 0, "device_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return list(reversed(docs))


@api_router.post("/devices/{device_id}/commands")
async def enqueue_command(device_id: str, cmd: DeviceCommand):
    doc = {
        "id": str(uuid.uuid4()),
        "device_id": device_id,
        "type": cmd.type,
        "value": cmd.value,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "consumed": False,
    }
    await db.device_commands.insert_one(doc)
    return {"id": doc["id"], "queued": True}


@api_router.get("/devices/{device_id}/commands")
async def fetch_commands(device_id: str, consume: bool = False):
    """Non-consuming preview by default. NodeMCU should call /commands/poll instead."""
    cur = db.device_commands.find(
        {"device_id": device_id, "consumed": False}, {"_id": 0}
    ).sort("created_at", 1)
    docs = await cur.to_list(50)
    if consume and docs:
        ids = [d["id"] for d in docs]
        await db.device_commands.update_many({"id": {"$in": ids}}, {"$set": {"consumed": True}})
    return {"commands": docs}


@api_router.get("/devices/{device_id}/commands/poll")
async def poll_commands(device_id: str):
    """NodeMCU long-poll endpoint — consumes pending commands atomically."""
    cur = db.device_commands.find(
        {"device_id": device_id, "consumed": False}, {"_id": 0}
    ).sort("created_at", 1)
    docs = await cur.to_list(50)
    if docs:
        ids = [d["id"] for d in docs]
        await db.device_commands.update_many({"id": {"$in": ids}}, {"$set": {"consumed": True}})
    return {"commands": docs}


@api_router.get("/devices/{device_id}/status")
async def device_status(device_id: str):
    d = await db.devices.find_one({"id": device_id}, {"_id": 0})
    pending = await db.device_commands.count_documents({"device_id": device_id, "consumed": False})
    online = False
    if d and d.get("last_seen"):
        try:
            last = datetime.fromisoformat(d["last_seen"].replace("Z", "+00:00"))
            online = (datetime.now(timezone.utc) - last).total_seconds() < 60
        except Exception:
            pass
    return {"device_id": device_id, "online": online, "info": d, "pending_commands": pending}


app.include_router(api_router)


# ===================== CORS (env-driven, prod-safe) =====================
# Production: set CORS_ORIGINS in backend/.env to a comma-separated list of allowed origins
# (e.g., https://your-app.example.com). When credentials are sent, "*" is invalid per spec, so
# we only enable allow_credentials when an explicit origin list is provided.

_raw_cors = os.environ.get("CORS_ORIGINS", "*").strip()
_origins = [o.strip() for o in _raw_cors.split(",") if o.strip()]
_allow_credentials = _raw_cors != "*" and len(_origins) > 0

app.add_middleware(
    CORSMiddleware,
    allow_credentials=_allow_credentials,
    allow_origins=_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
