"""Timetable routing over GTFS (Connection Scan Algorithm). OWNER: workstream 1 (Routing).

FROZEN INTERFACE: keep the signatures of `earliest_arrivals` and `latest_departures` unchanged; the
planner (workstream 2) depends on them. The bodies below are STUBS that fake direct buses at 60 km/h
so other workstreams can build now. Replace them with real CSA (see docs/PLAN.md).
"""
import math
from datetime import datetime, timedelta

from backend.db import load_areas
from backend.models import Area, Journey, Leg

MIN_CHANGE_S = 5 * 60


def earliest_arrivals(origin_area: int, depart_after: datetime) -> dict[int, Journey]:
    """Earliest-arrival journey from `origin_area` to EVERY reachable area, leaving at/after `depart_after`.

    Returns {dest_area_id: Journey}. Origin itself is not included. `depart_after` is tz-aware (Europe/London).
    """
    areas = load_areas()
    origin = areas[origin_area]
    out = {}
    for dest in areas.values():
        if dest.id == origin_area or dest.lat is None or origin.lat is None:
            continue
        dep = _round_up(depart_after + timedelta(minutes=10))
        out[dest.id] = _stub_journey(origin, dest, dep, dep + _stub_duration(origin, dest))
    return out


def latest_departures(dest_area: int, arrive_by: datetime) -> dict[int, Journey]:
    """Latest-departing journey from EVERY area that still reaches `dest_area` by `arrive_by`.

    Returns {origin_area_id: Journey}. Destination itself is not included.
    """
    areas = load_areas()
    dest = areas[dest_area]
    out = {}
    for origin in areas.values():
        if origin.id == dest_area or origin.lat is None or dest.lat is None:
            continue
        arr = _round_down(arrive_by - timedelta(minutes=5))
        out[origin.id] = _stub_journey(origin, dest, arr - _stub_duration(origin, dest), arr)
    return out


# ---------------------------------------------------------------- stub helpers (delete when real)

def _km(a: Area, b: Area) -> float:
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dp, dl = p2 - p1, math.radians(b.lon - a.lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h)) * 1.3  # road factor


def _stub_duration(a: Area, b: Area) -> timedelta:
    return timedelta(minutes=round(_km(a, b) / 60 * 60) + 5)


def _round_up(t: datetime) -> datetime:
    return t + timedelta(minutes=(-t.minute) % 5, seconds=-t.second, microseconds=-t.microsecond)


def _round_down(t: datetime) -> datetime:
    return t - timedelta(minutes=t.minute % 5, seconds=t.second, microseconds=t.microsecond)


def _stub_journey(a: Area, b: Area, dep: datetime, arr: datetime) -> Journey:
    km = round(_km(a, b), 1)
    leg = Leg(trip_id=f"STUB-{a.id}-{b.id}", route_id="E?", headsign=b.name, from_area=a, to_area=b,
              departure=dep, arrival=arr, dist_km=km, price_gbp=round(2 + km * 0.1, 2))
    return Journey(origin_area_id=a.id, dest_area_id=b.id, departure=dep, arrival=arr, legs=[leg],
                   changes=0, total_km=km, price_gbp=leg.price_gbp)


if __name__ == "__main__":
    # Quick manual check: python -m backend.routing
    from backend.db import TZ

    t = datetime(2026, 10, 10, 8, 0, tzinfo=TZ)
    res = earliest_arrivals(13, t)  # 13 = Dundee (City Centre)
    print(len(res), "reachable; Dundee -> Edinburgh:", res.get(42))
