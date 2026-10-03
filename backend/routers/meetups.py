"""Meetup CRUD + station search. OWNER: workstream 2 (Planner & API)."""
import random
from datetime import datetime

from fastapi import APIRouter, HTTPException

from backend.db import TZ, get_conn, load_areas
from backend.models import Area, Friend, FriendIn, Meetup, MeetupCreate, PickSuggestion

router = APIRouter(prefix="/api", tags=["meetups"])

COLOURS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316"]
WORDS_A = ["misty", "bonnie", "wee", "canny", "braw", "highland", "golden", "wild", "rolling", "silver"]
WORDS_B = ["loch", "glen", "ben", "thistle", "puffin", "stag", "heather", "burn", "brae", "munro"]


@router.get("/locations/search", response_model=list[Area])
def search_locations(q: str = "", limit: int = 10):
    """Station autocomplete, served from the local `areas` table (no live API call)."""
    terms = q.lower().split()
    hits = [a for a in load_areas().values()
            if a.lat is not None and all(t in f"{a.name} {a.region_name or ''}".lower() for t in terms)]
    # load_areas() is already most-popular-first; stable sort keeps that within each group
    hits.sort(key=lambda a: not a.name.lower().startswith(q.lower()))
    return hits[:limit]


def get_meetup(slug: str) -> Meetup:
    areas = load_areas()
    with get_conn() as conn:
        m = conn.execute("SELECT * FROM meetups WHERE slug = ?", (slug,)).fetchone()
        if not m:
            raise HTTPException(404, "Meetup not found")
        friends = conn.execute("SELECT * FROM friends WHERE meetup_slug = ? ORDER BY id", (slug,)).fetchall()
    return Meetup(
        slug=m["slug"], mode=m["mode"], title=m["title"], date=m["date"],
        destination=areas.get(m["destination_area_id"]) if m["destination_area_id"] else None,
        target_time=m["target_time"], created_at=m["created_at"],
        friends=[Friend(id=f["id"], name=f["name"], origin=areas[f["origin_area_id"]],
                        earliest_departure=f["earliest_departure"], colour=f["colour"]) for f in friends],
    )


@router.post("/meetups", response_model=Meetup)
def create_meetup(body: MeetupCreate):
    if body.mode == "arrive" and not (body.destination_area_id and body.target_time):
        raise HTTPException(422, "mode=arrive needs destination_area_id and target_time")
    slug = f"{random.choice(WORDS_A)}-{random.choice(WORDS_B)}-{random.randint(10, 99)}"
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO meetups (slug, mode, title, date, destination_area_id, target_time, created_at) VALUES (?,?,?,?,?,?,?)",
            (slug, body.mode, body.title, body.date.isoformat(), body.destination_area_id,
             _iso(body.target_time), datetime.now(TZ).isoformat()),
        )
    return get_meetup(slug)


@router.get("/meetups/{slug}", response_model=Meetup)
def read_meetup(slug: str):
    return get_meetup(slug)


@router.post("/meetups/{slug}/friends", response_model=Friend)
def join_meetup(slug: str, body: FriendIn):
    meetup = get_meetup(slug)
    if body.origin_area_id not in load_areas():
        raise HTTPException(422, "Unknown origin_area_id")
    colour = COLOURS[len(meetup.friends) % len(COLOURS)]
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO friends (meetup_slug, name, origin_area_id, earliest_departure, colour) VALUES (?,?,?,?,?)",
            (slug, body.name, body.origin_area_id, _iso(body.earliest_departure), colour),
        )
    return next(f for f in get_meetup(slug).friends if f.id == cur.lastrowid)


@router.post("/meetups/{slug}/pick", response_model=Meetup)
def pick_suggestion(slug: str, body: PickSuggestion):
    get_meetup(slug)
    with get_conn() as conn:
        conn.execute("UPDATE meetups SET mode='arrive', destination_area_id=?, target_time=? WHERE slug=?",
                     (body.area_id, _iso(body.target_time), slug))
    return get_meetup(slug)


def _iso(t: datetime | None) -> str | None:
    if t is None:
        return None
    return (t if t.tzinfo else t.replace(tzinfo=TZ)).astimezone(TZ).isoformat()
