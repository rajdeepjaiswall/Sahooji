"""Sahu Sales Solution — FastAPI backend.

All routes are prefixed with /api. Uses MongoDB via motor (async).
Auth: JWT (HS256) with access + refresh tokens.
First registered user auto-becomes admin.
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import bcrypt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "sahu_sales")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me-please-8f3d")
JWT_REFRESH_SECRET = os.environ.get("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me-2a")
ACCESS_TOKEN_MINUTES = int(os.environ.get("ACCESS_TOKEN_MINUTES", "1440"))  # 24h for internal app
REFRESH_TOKEN_DAYS = int(os.environ.get("REFRESH_TOKEN_DAYS", "30"))
ALGO = "HS256"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("sahu")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Sahu Sales Solution API")
api = APIRouter(prefix="/api")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def sha256(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def new_id() -> str:
    return str(uuid.uuid4())


def make_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "exp": now_utc() + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGO)


def make_refresh_token(user_id: str) -> tuple[str, str]:
    jti = secrets.token_urlsafe(24)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": jti,
        "exp": now_utc() + timedelta(days=REFRESH_TOKEN_DAYS),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_REFRESH_SECRET, algorithm=ALGO), jti


def scrub(doc: dict | None) -> dict | None:
    """Remove Mongo _id from a document (never mutate the input)."""
    if doc is None:
        return None
    out = {k: v for k, v in doc.items() if k != "_id"}
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = iso(v)
    return out


async def get_current_user(token: str | None = Depends(oauth2)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGO])
        if payload.get("type") != "access":
            raise JWTError()
        uid = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.profiles.find_one({"id": uid})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("is_disabled"):
        raise HTTPException(status_code=403, detail="Account disabled")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ---------------------------------------------------------------------------
# Seed default event tags on startup
# ---------------------------------------------------------------------------
DEFAULT_TAGS = [
    {"name": "Call", "color": "#F97316", "icon": "phone"},
    {"name": "Demo Call", "color": "#3B82F6", "icon": "monitor"},
    {"name": "Payment Collection", "color": "#22C55E", "icon": "banknote"},
    {"name": "Payment Request", "color": "#EAB308", "icon": "receipt"},
    {"name": "AMC Renewal", "color": "#EF4444", "icon": "refresh-cw"},
    {"name": "Follow Up", "color": "#8B5CF6", "icon": "repeat"},
    {"name": "Installation", "color": "#10B981", "icon": "wrench"},
    {"name": "Meeting", "color": "#EC4899", "icon": "users"},
]


@app.on_event("startup")
async def on_startup() -> None:
    await db.profiles.create_index("email", unique=True)
    await db.contacts.create_index("owner_id")
    await db.events.create_index("event_at")
    await db.reminders.create_index([("remind_at", 1), ("status", 1)])
    await db.invoices.create_index("invoice_number", unique=True)
    # Seed tags if empty
    if await db.event_tags.count_documents({}) == 0:
        for t in DEFAULT_TAGS:
            await db.event_tags.insert_one({
                "id": new_id(),
                "name": t["name"],
                "color": t["color"],
                "icon": t["icon"],
                "created_by": "system",
                "created_at": now_utc(),
            })
    logger.info("Sahu backend ready (db=%s)", DB_NAME)


@app.on_event("shutdown")
async def on_shutdown() -> None:
    client.close()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=6)
    organisation_name: str | None = None
    mobile: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


def public_profile(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "full_name": u.get("full_name"),
        "organisation_name": u.get("organisation_name"),
        "mobile": u.get("mobile"),
        "role": u.get("role", "team_member"),
        "avatar_url": u.get("avatar_url"),
        "ringtone_url": u.get("ringtone_url"),
        "vibrate": u.get("vibrate", True),
        "is_disabled": u.get("is_disabled", False),
        "permissions": u.get("permissions", {}),
        "floating_assistant": u.get("floating_assistant", False),
        "created_at": iso(u.get("created_at")),
    }


@api.post("/auth/register")
async def register(data: RegisterIn):
    if await db.profiles.find_one({"email": data.email.lower()}):
        raise HTTPException(409, "Email already registered")
    is_first = (await db.profiles.count_documents({})) == 0
    role = "admin" if is_first else "team_member"
    permissions = {
        "contacts": True,
        "events": True,
        "reminders": True,
        "invoices": True,
        "team": is_first,
    }
    uid = new_id()
    profile = {
        "id": uid,
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "full_name": data.full_name,
        "organisation_name": data.organisation_name,
        "mobile": data.mobile,
        "role": role,
        "avatar_url": None,
        "ringtone_url": None,
        "vibrate": True,
        "is_disabled": False,
        "permissions": permissions,
        "floating_assistant": False,
        "refresh_jti_hash": None,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.profiles.insert_one(dict(profile))
    at = make_access_token(uid, role)
    rt, jti = make_refresh_token(uid)
    await db.profiles.update_one({"id": uid}, {"$set": {"refresh_jti_hash": sha256(jti)}})
    return {
        "access_token": at,
        "refresh_token": rt,
        "token_type": "bearer",
        "user": public_profile(profile),
    }


@api.post("/auth/login")
async def login(data: LoginIn):
    user = await db.profiles.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password")
    if user.get("is_disabled"):
        raise HTTPException(403, "Account disabled")
    at = make_access_token(user["id"], user.get("role", "team_member"))
    rt, jti = make_refresh_token(user["id"])
    await db.profiles.update_one({"id": user["id"]}, {"$set": {"refresh_jti_hash": sha256(jti)}})
    return {
        "access_token": at,
        "refresh_token": rt,
        "token_type": "bearer",
        "user": public_profile(user),
    }


@api.post("/auth/refresh")
async def refresh(data: RefreshIn):
    try:
        payload = jwt.decode(data.refresh_token, JWT_REFRESH_SECRET, algorithms=[ALGO])
        if payload.get("type") != "refresh":
            raise JWTError()
    except JWTError:
        raise HTTPException(401, "Invalid refresh token")
    user = await db.profiles.find_one({"id": payload.get("sub")})
    if not user or user.get("refresh_jti_hash") != sha256(payload.get("jti", "")):
        raise HTTPException(401, "Invalid refresh token")
    at = make_access_token(user["id"], user.get("role", "team_member"))
    rt, jti = make_refresh_token(user["id"])
    await db.profiles.update_one({"id": user["id"]}, {"$set": {"refresh_jti_hash": sha256(jti)}})
    return {"access_token": at, "refresh_token": rt, "token_type": "bearer"}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_profile(user)


@api.post("/auth/password-change")
async def password_change(data: ChangePasswordIn, user=Depends(get_current_user)):
    if not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    await db.profiles.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(data.new_password), "refresh_jti_hash": None, "updated_at": now_utc()}},
    )
    return {"message": "password changed"}


# ---------------------------------------------------------------------------
# Profile update
# ---------------------------------------------------------------------------
class ProfileUpdate(BaseModel):
    full_name: str | None = None
    organisation_name: str | None = None
    mobile: str | None = None
    avatar_url: str | None = None
    ringtone_url: str | None = None
    vibrate: bool | None = None
    floating_assistant: bool | None = None


@api.patch("/auth/me")
async def update_me(data: ProfileUpdate, user=Depends(get_current_user)):
    patch = {k: v for k, v in data.dict().items() if v is not None}
    if patch:
        patch["updated_at"] = now_utc()
        await db.profiles.update_one({"id": user["id"]}, {"$set": patch})
    fresh = await db.profiles.find_one({"id": user["id"]})
    return public_profile(fresh)


# ---------------------------------------------------------------------------
# Event Tags
# ---------------------------------------------------------------------------
class TagIn(BaseModel):
    name: str
    color: str
    icon: str | None = "tag"


@api.get("/tags")
async def list_tags(user=Depends(get_current_user)):
    docs = await db.event_tags.find().sort("name", 1).to_list(500)
    return [scrub(d) for d in docs]


@api.post("/tags")
async def create_tag(data: TagIn, user=Depends(get_current_user)):
    doc = {
        "id": new_id(),
        "name": data.name,
        "color": data.color,
        "icon": data.icon or "tag",
        "created_by": user["id"],
        "created_at": now_utc(),
    }
    await db.event_tags.insert_one(dict(doc))
    return scrub(doc)


@api.patch("/tags/{tag_id}")
async def update_tag(tag_id: str, data: TagIn, user=Depends(get_current_user)):
    await db.event_tags.update_one({"id": tag_id}, {"$set": data.dict()})
    doc = await db.event_tags.find_one({"id": tag_id})
    if not doc:
        raise HTTPException(404, "Tag not found")
    return scrub(doc)


@api.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, user=Depends(require_admin)):
    await db.event_tags.delete_one({"id": tag_id})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------
class ContactIn(BaseModel):
    full_name: str
    organisation_name: str | None = None
    mobile: str | None = None
    alternate_mobile: str | None = None
    email: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    gps_lat: float | None = None
    gps_lng: float | None = None
    notes: str | None = None
    purchase_history: str | None = None
    tags: list[str] = []


@api.get("/contacts")
async def list_contacts(user=Depends(get_current_user), q: str | None = None, scope: str = "mine"):
    filt: dict[str, Any] = {}
    if scope != "all" or user.get("role") != "admin":
        filt["owner_id"] = user["id"]
    if q:
        filt["$or"] = [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"organisation_name": {"$regex": q, "$options": "i"}},
            {"mobile": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.contacts.find(filt).sort("created_at", -1).to_list(2000)
    return [scrub(d) for d in docs]


@api.post("/contacts")
async def create_contact(data: ContactIn, user=Depends(get_current_user)):
    doc = data.dict()
    doc.update({
        "id": new_id(),
        "owner_id": user["id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
    })
    await db.contacts.insert_one(dict(doc))
    return scrub(doc)


@api.get("/contacts/{cid}")
async def get_contact(cid: str, user=Depends(get_current_user)):
    doc = await db.contacts.find_one({"id": cid})
    if not doc:
        raise HTTPException(404, "Contact not found")
    return scrub(doc)


@api.patch("/contacts/{cid}")
async def update_contact(cid: str, data: ContactIn, user=Depends(get_current_user)):
    existing = await db.contacts.find_one({"id": cid})
    if not existing:
        raise HTTPException(404, "Contact not found")
    if existing.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Not allowed")
    patch = data.dict()
    patch["updated_at"] = now_utc()
    await db.contacts.update_one({"id": cid}, {"$set": patch})
    fresh = await db.contacts.find_one({"id": cid})
    return scrub(fresh)


@api.delete("/contacts/{cid}")
async def delete_contact(cid: str, user=Depends(get_current_user)):
    existing = await db.contacts.find_one({"id": cid})
    if not existing:
        raise HTTPException(404, "Contact not found")
    if existing.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Not allowed")
    await db.contacts.delete_one({"id": cid})
    return {"deleted": True}


class BulkContactsIn(BaseModel):
    contacts: list[ContactIn]


@api.post("/contacts/bulk")
async def bulk_contacts(data: BulkContactsIn, user=Depends(get_current_user)):
    inserted = 0
    for c in data.contacts:
        doc = c.dict()
        doc.update({
            "id": new_id(),
            "owner_id": user["id"],
            "created_at": now_utc(),
            "updated_at": now_utc(),
        })
        await db.contacts.insert_one(dict(doc))
        inserted += 1
    return {"inserted": inserted}


# ---------------------------------------------------------------------------
# Events + Reminders
# ---------------------------------------------------------------------------
class ReminderIn(BaseModel):
    remind_at: datetime
    assignee_id: str | None = None


class EventIn(BaseModel):
    contact_id: str
    tag_id: str | None = None
    title: str
    description: str | None = None
    event_at: datetime
    location: str | None = None
    assigned_to: str | None = None
    reminders: list[ReminderIn] = []


async def _enrich_event(doc: dict) -> dict:
    out = scrub(doc)
    if not out:
        return out
    if out.get("contact_id"):
        c = await db.contacts.find_one({"id": out["contact_id"]})
        out["contact"] = scrub(c)
    if out.get("tag_id"):
        t = await db.event_tags.find_one({"id": out["tag_id"]})
        out["tag"] = scrub(t)
    if out.get("assigned_to"):
        a = await db.profiles.find_one({"id": out["assigned_to"]})
        out["assignee"] = public_profile(a) if a else None
    reminders = await db.reminders.find({"event_id": out["id"]}).sort("remind_at", 1).to_list(50)
    out["reminders"] = [scrub(r) for r in reminders]
    return out


@api.get("/events")
async def list_events(
    user=Depends(get_current_user),
    status: str | None = None,
    scope: str = "mine",
    tag_id: str | None = None,
    assignee: str | None = None,
):
    filt: dict[str, Any] = {}
    if status:
        filt["status"] = status
    if tag_id:
        filt["tag_id"] = tag_id
    if assignee:
        filt["assigned_to"] = assignee
    if scope != "all" or user.get("role") != "admin":
        filt["$or"] = [{"assigned_to": user["id"]}, {"created_by": user["id"]}]
    docs = await db.events.find(filt).sort("event_at", -1).to_list(2000)
    return await _batch_enrich_events(docs)


async def _batch_enrich_events(docs: list[dict]) -> list[dict]:
    """Batch-fetch related contacts / tags / assignees / reminders in $in queries."""
    if not docs:
        return []
    contact_ids = {d.get("contact_id") for d in docs if d.get("contact_id")}
    tag_ids = {d.get("tag_id") for d in docs if d.get("tag_id")}
    assignee_ids = {d.get("assigned_to") for d in docs if d.get("assigned_to")}
    event_ids = [d.get("id") for d in docs if d.get("id")]

    contacts_map: dict[str, dict] = {}
    if contact_ids:
        async for c in db.contacts.find({"id": {"$in": list(contact_ids)}}):
            contacts_map[c["id"]] = c
    tags_map: dict[str, dict] = {}
    if tag_ids:
        async for t in db.event_tags.find({"id": {"$in": list(tag_ids)}}):
            tags_map[t["id"]] = t
    assignees_map: dict[str, dict] = {}
    if assignee_ids:
        async for p in db.profiles.find({"id": {"$in": list(assignee_ids)}}):
            assignees_map[p["id"]] = p
    reminders_by_event: dict[str, list[dict]] = {}
    if event_ids:
        async for r in db.reminders.find({"event_id": {"$in": event_ids}}).sort("remind_at", 1):
            reminders_by_event.setdefault(r["event_id"], []).append(r)

    out = []
    for d in docs:
        row = scrub(d)
        if not row:
            continue
        c = contacts_map.get(row.get("contact_id"))
        row["contact"] = scrub(c)
        t = tags_map.get(row.get("tag_id"))
        row["tag"] = scrub(t)
        a = assignees_map.get(row.get("assigned_to"))
        row["assignee"] = public_profile(a) if a else None
        row["reminders"] = [scrub(r) for r in reminders_by_event.get(row["id"], [])]
        out.append(row)
    return out


@api.post("/events")
async def create_event(data: EventIn, user=Depends(get_current_user)):
    assigned_to = data.assigned_to or user["id"]
    eid = new_id()
    doc = {
        "id": eid,
        "contact_id": data.contact_id,
        "tag_id": data.tag_id,
        "title": data.title,
        "description": data.description,
        "event_at": data.event_at,
        "location": data.location,
        "assigned_to": assigned_to,
        "created_by": user["id"],
        "status": "upcoming",
        "created_at": now_utc(),
    }
    await db.events.insert_one(dict(doc))
    for r in data.reminders:
        rem = {
            "id": new_id(),
            "event_id": eid,
            "assignee_id": r.assignee_id or assigned_to,
            "remind_at": r.remind_at,
            "status": "pending",
            "snoozed_until": None,
            "archived_at": None,
            "created_at": now_utc(),
        }
        await db.reminders.insert_one(dict(rem))
    fresh = await db.events.find_one({"id": eid})
    return await _enrich_event(fresh)


@api.get("/events/{eid}")
async def get_event(eid: str, user=Depends(get_current_user)):
    doc = await db.events.find_one({"id": eid})
    if not doc:
        raise HTTPException(404, "Event not found")
    return await _enrich_event(doc)


class EventStatusIn(BaseModel):
    status: str


@api.patch("/events/{eid}/status")
async def set_event_status(eid: str, data: EventStatusIn, user=Depends(get_current_user)):
    if data.status not in ("upcoming", "completed", "cancelled"):
        raise HTTPException(400, "Invalid status")
    await db.events.update_one({"id": eid}, {"$set": {"status": data.status}})
    fresh = await db.events.find_one({"id": eid})
    if not fresh:
        raise HTTPException(404, "Event not found")
    return await _enrich_event(fresh)


@api.delete("/events/{eid}")
async def delete_event(eid: str, user=Depends(get_current_user)):
    existing = await db.events.find_one({"id": eid})
    if not existing:
        raise HTTPException(404, "Event not found")
    if existing.get("created_by") != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Not allowed")
    await db.events.delete_one({"id": eid})
    await db.reminders.delete_many({"event_id": eid})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Reminders
# ---------------------------------------------------------------------------
async def _enrich_reminder(rem: dict) -> dict:
    out = scrub(rem)
    if not out:
        return out
    ev = await db.events.find_one({"id": out.get("event_id")})
    if ev:
        out["event"] = await _enrich_event(ev)
    return out


@api.get("/reminders")
async def list_reminders(
    user=Depends(get_current_user),
    scope: str = "mine",
    status: str | None = None,
):
    filt: dict[str, Any] = {}
    if status:
        filt["status"] = status
    if scope != "all" or user.get("role") != "admin":
        filt["assignee_id"] = user["id"]
    docs = await db.reminders.find(filt).sort("remind_at", 1).to_list(2000)

    if not docs:
        return []
    event_ids = [d.get("event_id") for d in docs if d.get("event_id")]
    events_docs: list[dict] = []
    if event_ids:
        events_docs = await db.events.find({"id": {"$in": event_ids}}).to_list(2000)
    enriched_events = await _batch_enrich_events(events_docs)
    events_map = {e["id"]: e for e in enriched_events}
    out = []
    for r in docs:
        row = scrub(r)
        if not row:
            continue
        row["event"] = events_map.get(row.get("event_id"))
        out.append(row)
    return out


class ReminderActionIn(BaseModel):
    action: str  # snoozed | ended | delegated | triggered
    snooze_minutes: int | None = None
    snooze_until: datetime | None = None
    delegate_to: str | None = None
    meta: dict = {}


@api.post("/reminders/{rid}/action")
async def act_reminder(rid: str, data: ReminderActionIn, user=Depends(get_current_user)):
    rem = await db.reminders.find_one({"id": rid})
    if not rem:
        raise HTTPException(404, "Reminder not found")
    patch: dict[str, Any] = {}
    meta: dict[str, Any] = dict(data.meta or {})
    if data.action == "snoozed":
        if data.snooze_until:
            until = data.snooze_until
        else:
            mins = data.snooze_minutes or 30
            until = now_utc() + timedelta(minutes=mins)
            meta["snooze_minutes"] = mins
        patch = {"status": "snoozed", "snoozed_until": until, "remind_at": until}
    elif data.action == "ended":
        patch = {"status": "archived", "archived_at": now_utc()}
    elif data.action == "delegated":
        if not data.delegate_to:
            raise HTTPException(400, "delegate_to required")
        patch = {"assignee_id": data.delegate_to}
        meta["from"] = rem.get("assignee_id")
        meta["to"] = data.delegate_to
    elif data.action == "triggered":
        pass
    else:
        raise HTTPException(400, "Invalid action")
    if patch:
        await db.reminders.update_one({"id": rid}, {"$set": patch})
    await db.reminder_activity.insert_one({
        "id": new_id(),
        "reminder_id": rid,
        "actor_id": user["id"],
        "action": data.action,
        "meta": meta,
        "created_at": now_utc(),
    })
    fresh = await db.reminders.find_one({"id": rid})
    return await _enrich_reminder(fresh)


@api.get("/activity")
async def activity(user=Depends(get_current_user), limit: int = 100):
    docs = await db.reminder_activity.find().sort("created_at", -1).to_list(limit)
    if not docs:
        return []
    actor_ids = {d.get("actor_id") for d in docs if d.get("actor_id")}
    reminder_ids = [d.get("reminder_id") for d in docs if d.get("reminder_id")]

    actors_map: dict[str, dict] = {}
    if actor_ids:
        async for p in db.profiles.find({"id": {"$in": list(actor_ids)}}):
            actors_map[p["id"]] = p
    reminders_map: dict[str, dict] = {}
    if reminder_ids:
        async for r in db.reminders.find({"id": {"$in": reminder_ids}}):
            reminders_map[r["id"]] = r
    event_ids = list({r.get("event_id") for r in reminders_map.values() if r.get("event_id")})
    events_map: dict[str, dict] = {}
    contact_ids: set[str] = set()
    if event_ids:
        async for e in db.events.find({"id": {"$in": event_ids}}):
            events_map[e["id"]] = e
            if e.get("contact_id"):
                contact_ids.add(e["contact_id"])
    contacts_map: dict[str, dict] = {}
    if contact_ids:
        async for c in db.contacts.find({"id": {"$in": list(contact_ids)}}):
            contacts_map[c["id"]] = c

    out = []
    for d in docs:
        row = scrub(d)
        actor = actors_map.get(row.get("actor_id"))
        row["actor"] = public_profile(actor) if actor else None
        rem = reminders_map.get(row.get("reminder_id"))
        if rem:
            ev = events_map.get(rem.get("event_id"))
            if ev:
                c = contacts_map.get(ev.get("contact_id"))
                row["event_title"] = ev.get("title")
                row["contact_name"] = c.get("full_name") if c else None
        out.append(row)
    return out


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
class ProductIn(BaseModel):
    name: str
    description: str | None = None
    unit_price: float = 0
    tax_percent: float = 0
    unit: str | None = "pcs"


@api.get("/products")
async def list_products(user=Depends(get_current_user)):
    docs = await db.products.find().sort("name", 1).to_list(1000)
    return [scrub(d) for d in docs]


@api.post("/products")
async def create_product(data: ProductIn, user=Depends(get_current_user)):
    doc = data.dict()
    doc.update({"id": new_id(), "created_by": user["id"], "created_at": now_utc()})
    await db.products.insert_one(dict(doc))
    return scrub(doc)


@api.patch("/products/{pid}")
async def update_product(pid: str, data: ProductIn, user=Depends(get_current_user)):
    await db.products.update_one({"id": pid}, {"$set": data.dict()})
    doc = await db.products.find_one({"id": pid})
    if not doc:
        raise HTTPException(404, "Product not found")
    return scrub(doc)


@api.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(get_current_user)):
    await db.products.delete_one({"id": pid})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------
class InvoiceItem(BaseModel):
    name: str
    qty: float = 1
    unit: str | None = "pcs"
    unit_price: float = 0
    tax_percent: float = 0
    row_tax: float = 0
    row_total: float = 0


class InvoiceIn(BaseModel):
    contact_id: str
    invoice_date: datetime
    due_date: datetime | None = None
    items: list[InvoiceItem] = []
    subtotal: float = 0
    tax_total: float = 0
    discount: float = 0
    grand_total: float = 0
    notes: str | None = None
    terms: str | None = None
    status: str = "draft"


def indian_fy(d: datetime) -> str:
    y = d.year
    if d.month < 4:
        return f"{y - 1}-{str(y)[-2:]}"
    return f"{y}-{str(y + 1)[-2:]}"


async def next_invoice_number(d: datetime) -> str:
    prefix = f"INV-{d.strftime('%Y%m')}-"
    latest = await db.invoices.find(
        {"invoice_number": {"$regex": f"^{prefix}"}}
    ).sort("invoice_number", -1).limit(1).to_list(1)
    n = 1
    if latest:
        try:
            n = int(latest[0]["invoice_number"].split("-")[-1]) + 1
        except Exception:
            n = 1
    return f"{prefix}{n:03d}"


@api.get("/invoices")
async def list_invoices(user=Depends(get_current_user), status: str | None = None, q: str | None = None):
    filt: dict[str, Any] = {}
    if status:
        filt["status"] = status
    if q:
        filt["invoice_number"] = {"$regex": q, "$options": "i"}
    docs = await db.invoices.find(filt).sort("invoice_date", -1).to_list(2000)
    if not docs:
        return []
    contact_ids = {d.get("contact_id") for d in docs if d.get("contact_id")}
    contacts_map: dict[str, dict] = {}
    if contact_ids:
        async for c in db.contacts.find({"id": {"$in": list(contact_ids)}}):
            contacts_map[c["id"]] = c
    out = []
    for d in docs:
        row = scrub(d)
        row["contact"] = scrub(contacts_map.get(row.get("contact_id")))
        out.append(row)
    return out


@api.post("/invoices")
async def create_invoice(data: InvoiceIn, user=Depends(get_current_user)):
    inv_no = await next_invoice_number(data.invoice_date)
    doc = data.dict()
    doc.update({
        "id": new_id(),
        "invoice_number": inv_no,
        "financial_year": indian_fy(data.invoice_date),
        "created_by": user["id"],
        "created_at": now_utc(),
    })
    await db.invoices.insert_one(dict(doc))
    saved = await db.invoices.find_one({"id": doc["id"]})
    row = scrub(saved)
    c = await db.contacts.find_one({"id": row.get("contact_id")})
    row["contact"] = scrub(c)
    return row


@api.get("/invoices/{iid}")
async def get_invoice(iid: str, user=Depends(get_current_user)):
    doc = await db.invoices.find_one({"id": iid})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    row = scrub(doc)
    c = await db.contacts.find_one({"id": row.get("contact_id")})
    row["contact"] = scrub(c)
    return row


@api.patch("/invoices/{iid}")
async def update_invoice(iid: str, data: InvoiceIn, user=Depends(get_current_user)):
    existing = await db.invoices.find_one({"id": iid})
    if not existing:
        raise HTTPException(404, "Invoice not found")
    patch = data.dict()
    patch["financial_year"] = indian_fy(data.invoice_date)
    await db.invoices.update_one({"id": iid}, {"$set": patch})
    fresh = await db.invoices.find_one({"id": iid})
    row = scrub(fresh)
    c = await db.contacts.find_one({"id": row.get("contact_id")})
    row["contact"] = scrub(c)
    return row


@api.delete("/invoices/{iid}")
async def delete_invoice(iid: str, user=Depends(get_current_user)):
    await db.invoices.delete_one({"id": iid})
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Team management (admin)
# ---------------------------------------------------------------------------
class TeamMemberIn(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=6)
    role: str = "team_member"
    permissions: dict = Field(default_factory=lambda: {
        "contacts": True, "events": True, "reminders": True, "invoices": True, "team": False
    })
    mobile: str | None = None


class TeamMemberPatch(BaseModel):
    full_name: str | None = None
    role: str | None = None
    permissions: dict | None = None
    is_disabled: bool | None = None
    mobile: str | None = None


@api.get("/team")
async def list_team(user=Depends(get_current_user)):
    docs = await db.profiles.find().sort("created_at", 1).to_list(500)
    return [public_profile(d) for d in docs]


@api.post("/team")
async def create_member(data: TeamMemberIn, admin=Depends(require_admin)):
    if await db.profiles.find_one({"email": data.email.lower()}):
        raise HTTPException(409, "Email already registered")
    uid = new_id()
    doc = {
        "id": uid,
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "full_name": data.full_name,
        "organisation_name": admin.get("organisation_name"),
        "mobile": data.mobile,
        "role": data.role,
        "avatar_url": None,
        "ringtone_url": None,
        "vibrate": True,
        "is_disabled": False,
        "permissions": data.permissions,
        "floating_assistant": False,
        "refresh_jti_hash": None,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.profiles.insert_one(dict(doc))
    await db.team_invites.insert_one({
        "id": new_id(),
        "email": data.email.lower(),
        "role": data.role,
        "permissions": data.permissions,
        "invited_by": admin["id"],
        "accepted": True,
        "created_at": now_utc(),
    })
    return public_profile(doc)


@api.patch("/team/{uid}")
async def patch_member(uid: str, data: TeamMemberPatch, admin=Depends(require_admin)):
    patch = {k: v for k, v in data.dict().items() if v is not None}
    if patch:
        patch["updated_at"] = now_utc()
        await db.profiles.update_one({"id": uid}, {"$set": patch})
    fresh = await db.profiles.find_one({"id": uid})
    if not fresh:
        raise HTTPException(404, "Member not found")
    return public_profile(fresh)


class ResetMemberPasswordIn(BaseModel):
    new_password: str = Field(min_length=6)


@api.post("/team/{uid}/reset-password")
async def reset_member_password(uid: str, data: ResetMemberPasswordIn, admin=Depends(require_admin)):
    await db.profiles.update_one(
        {"id": uid},
        {"$set": {"password_hash": hash_password(data.new_password), "refresh_jti_hash": None}},
    )
    return {"message": "password reset"}


# ---------------------------------------------------------------------------
# Debug / health
# ---------------------------------------------------------------------------
@api.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"status": "ok", "db": DB_NAME, "time": iso(now_utc())}
    except Exception as e:
        return {"status": "error", "db": DB_NAME, "error": str(e)}


@api.get("/debug/counts")
async def debug_counts(user=Depends(get_current_user)):
    counts = {}
    for coll in ("profiles", "contacts", "events", "reminders", "invoices", "products", "event_tags", "reminder_activity"):
        try:
            counts[coll] = await db[coll].count_documents({})
        except Exception as e:  # pragma: no cover
            counts[coll] = f"error: {e}"
    return counts


# ---------------------------------------------------------------------------
# App bootstrap
# ---------------------------------------------------------------------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@api.get("/")
async def root():
    return {"app": "Sahu Sales Solution API", "ok": True}
