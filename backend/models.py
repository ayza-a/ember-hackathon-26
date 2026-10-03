"""API contracts. FROZEN SHARED FILE: keep in sync with frontend/src/types.ts. Additive changes only."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

Mode = Literal["arrive", "suggest"]  # arrive = "meet at X by T"; suggest = "where should we meet?"


class Area(BaseModel):
    id: int
    name: str
    region_name: str | None = None
    lat: float | None = None
    lon: float | None = None


class Leg(BaseModel):
    trip_id: str
    route_id: str                   # e.g. "E1"
    headsign: str | None = None
    from_area: Area
    to_area: Area
    departure: datetime
    arrival: datetime
    dist_km: float
    price_gbp: float | None = None


class Journey(BaseModel):
    origin_area_id: int
    dest_area_id: int
    departure: datetime
    arrival: datetime
    legs: list[Leg]
    changes: int
    total_km: float
    price_gbp: float | None = None


class FriendIn(BaseModel):
    name: str
    origin_area_id: int
    earliest_departure: datetime | None = None  # used by mode=suggest


class Friend(BaseModel):
    id: int
    name: str
    origin: Area
    earliest_departure: datetime | None = None
    colour: str                     # hex, assigned by backend


class MeetupCreate(BaseModel):
    mode: Mode
    title: str | None = None
    date: date
    destination_area_id: int | None = None  # required for mode=arrive
    target_time: datetime | None = None     # required for mode=arrive


class Meetup(BaseModel):
    slug: str
    mode: Mode
    title: str | None = None
    date: date
    destination: Area | None = None
    target_time: datetime | None = None
    friends: list[Friend]
    created_at: datetime


class PickSuggestion(BaseModel):
    """Turn a mode=suggest meetup into mode=arrive at the chosen place/time."""
    area_id: int
    target_time: datetime


class MeetEvent(BaseModel):
    kind: Literal["same_bus", "same_change"]
    area: Area                      # where they meet
    start: datetime
    end: datetime                   # same_bus: when they alight together/one alights
    friend_ids: list[int]
    trip_id: str | None = None      # same_bus only
    description: str                # human sentence, e.g. "Ben boards Anna's bus at Perth"


class FriendPlan(BaseModel):
    friend_id: int
    journey: Journey | None = None  # None = no route found
    note: str | None = None


class Plan(BaseModel):
    meetup_slug: str
    destination: Area
    target_time: datetime
    first_arrival: datetime | None = None
    last_arrival: datetime | None = None
    spread_min: int | None = None
    friends: list[FriendPlan]
    meet_events: list[MeetEvent]
    total_price_gbp: float | None = None


class MeetupSuggestion(BaseModel):
    area: Area
    meet_time: datetime             # when the last friend arrives
    total_travel_min: int
    total_km: float
    spread_min: int
    score: float                    # lower is better
    journeys: list[FriendPlan]
    places_summary: dict[str, int] = {}   # category -> count near this area


class Place(BaseModel):
    id: int
    name: str
    category: str
    lat: float
    lon: float
    near_area_id: int | None = None
    distance_m: int | None = None
    description: str | None = None
    source: Literal["osm", "curated"]
    url: str | None = None


class RouteLine(BaseModel):
    trip_id: str
    from_area_id: int
    to_area_id: int
    coordinates: list[list[float]]  # [[lon, lat], ...] GeoJSON order


class ServiceUpdate(BaseModel):
    type: str                       # "none" | "custom"
    short_message: str | None = None
