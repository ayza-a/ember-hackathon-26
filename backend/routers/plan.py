"""Plan + suggestion endpoints. OWNER: workstream 2 (Planner & API).

Plans are cached in memory, keyed by everything that affects them (destination, time, window, friends).
The frontend polls every 5 s; when someone joins, the key changes and the plan is recomputed once.
"""
from fastapi import APIRouter, HTTPException, Query

from backend import planner
from backend.models import Meetup, MeetupSuggestion, Plan
from backend.routers.meetups import get_meetup

router = APIRouter(prefix="/api/meetups", tags=["plan"])

_cache: dict[tuple, object] = {}
CACHE_MAX = 256


def _key(kind: str, meetup: Meetup, *extra) -> tuple:
    friends = tuple((f.id, f.origin.id, f.earliest_departure) for f in meetup.friends)
    dest = meetup.destination.id if meetup.destination else None
    return (kind, meetup.slug, meetup.mode, dest, meetup.target_time, meetup.date, friends, *extra)


def _cached(key: tuple, compute):
    if key not in _cache:
        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))  # drop the oldest entry
        _cache[key] = compute()
    return _cache[key]


@router.get("/{slug}/plan", response_model=Plan)
def get_plan(slug: str, window_min: int = Query(planner.WINDOW_MIN, ge=30, le=600,
                                                 description="How far before the target to look for arrivals")):
    meetup = get_meetup(slug)
    if meetup.mode != "arrive" or not meetup.destination:
        raise HTTPException(409, "Meetup has no destination yet; pick a suggestion first")
    return _cached(_key("plan", meetup, window_min), lambda: planner.plan_arrive(meetup, window_min))


@router.get("/{slug}/suggestions", response_model=list[MeetupSuggestion])
def get_suggestions(slug: str):
    meetup = get_meetup(slug)
    return _cached(_key("suggest", meetup), lambda: planner.suggest(meetup))
