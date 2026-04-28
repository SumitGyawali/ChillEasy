from fastapi import FastAPI, APIRouter, HTTPException
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

app = FastAPI(title="VaxChain Monitor API")
api_router = APIRouter(prefix="/api")


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
    destination: Optional[Dict[str, float]] = None  # {lat, lng, radius_m}
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


class AlertItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    type: str
    severity: str  # info | warning | critical
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


# ===================== Vaccine seeding =====================

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


@app.on_event("startup")
async def seed_vaccines():
    existing = await db.vaccines.count_documents({})
    if existing == 0:
        await db.vaccines.insert_many([dict(v) for v in DEFAULT_VACCINES])


# ===================== Routes =====================

@api_router.get("/")
async def root():
    return {"service": "VaxChain Monitor", "status": "ok"}


@api_router.get("/vaccines", response_model=List[Vaccine])
async def list_vaccines():
    docs = await db.vaccines.find({}, {"_id": 0}).to_list(100)
    return docs


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
async def list_sessions():
    docs = await db.sessions.find({}, {"_id": 0}).sort("started_at", -1).to_list(200)
    return docs


@api_router.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@api_router.patch("/sessions/{session_id}", response_model=Session)
async def update_session(session_id: str, update: Dict[str, Any]):
    update.pop("id", None)
    res = await db.sessions.find_one_and_update(
        {"id": session_id}, {"$set": update},
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
async def get_telemetry(session_id: str, limit: int = 5000):
    docs = await db.telemetry.find(
        {"session_id": session_id}, {"_id": 0, "session_id": 0}
    ).sort("timestamp", 1).to_list(limit)
    return docs


@api_router.post("/alerts", response_model=AlertItem)
async def create_alert(payload: AlertCreate):
    a = AlertItem(**payload.model_dump())
    await db.alerts.insert_one(a.model_dump())
    return a


@api_router.get("/sessions/{session_id}/alerts", response_model=List[AlertItem])
async def list_alerts(session_id: str):
    docs = await db.alerts.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", -1).to_list(500)
    return docs


@api_router.patch("/alerts/{alert_id}/dismiss")
async def dismiss_alert(alert_id: str):
    res = await db.alerts.find_one_and_update(
        {"id": alert_id}, {"$set": {"dismissed": True}},
        return_document=True, projection={"_id": 0},
    )
    if not res:
        raise HTTPException(404, "Alert not found")
    return res


# ===================== Device ingest + commands (HTTP fallback for NodeMCU) =====================

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


@api_router.post("/ingest/{device_id}")
async def ingest_device(device_id: str, payload: IngestPayload):
    """NodeMCU posts telemetry directly here when MQTT is unavailable."""
    doc = payload.model_dump()
    doc["device_id"] = device_id
    if not doc.get("timestamp"):
        doc["timestamp"] = datetime.now(timezone.utc).isoformat()
    await db.device_telemetry.insert_one(doc)
    # Mirror into session telemetry collection too if session_id provided
    if doc.get("session_id"):
        sdoc = {k: v for k, v in doc.items() if k != "device_id"}
        await db.telemetry.insert_one(sdoc)
    # Update device "seen" presence
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
    """UI enqueues a command for the NodeMCU device."""
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
async def fetch_commands(device_id: str, consume: bool = True):
    """NodeMCU polls this. With consume=true, marks returned commands as consumed."""
    cur = db.device_commands.find(
        {"device_id": device_id, "consumed": False}, {"_id": 0}
    ).sort("created_at", 1)
    docs = await cur.to_list(50)
    if consume and docs:
        ids = [d["id"] for d in docs]
        await db.device_commands.update_many(
            {"id": {"$in": ids}}, {"$set": {"consumed": True}}
        )
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
