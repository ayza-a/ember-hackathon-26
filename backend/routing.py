"""Timetable routing over GTFS (Connection Scan Algorithm). OWNER: workstream 1 (Routing).

FROZEN INTERFACE: keep the signatures of `earliest_arrivals` and `latest_departures` unchanged; the
planner (workstream 2) depends on them.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from backend.db import TZ, get_conn, load_areas
from backend.fares import leg_price
from backend.models import Area, Journey, Leg

MIN_CHANGE_S = 5 * 60  # 5 minutes
ROAD_FACTOR = 1.3      # fallback road factor for km

# ---------------------------------------------------------------------------
# Internal connection model + cache
# ---------------------------------------------------------------------------

@dataclass
class Connection:
    trip_id: str
    route_id: str
    headsign: str
    origin_atco: str
    dest_atco: str
    from_area_id: int
    to_area_id: int
    dep_s: int
    arr_s: int
    dist_km: float


_connections_cache: Dict[str, List[Connection]] = {}


def _service_date_from(dt: datetime) -> date:
    """Use local service date (Europe/London) for GTFS."""
    return dt.astimezone(TZ).date()


def _midnight(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 0, 0, tzinfo=TZ)


def _to_dt(d: date, seconds: int) -> datetime:
    return _midnight(d) + timedelta(seconds=seconds)


def _load_connections_for_date(d: date) -> List[Connection]:
    key = d.isoformat()
    hit = _connections_cache.get(key)
    if hit is not None:
        return hit

    with get_conn() as conn:
        ymd = d.strftime("%Y%m%d")

        # Which services run on this date?
        services: set[str] = set()
        for r in conn.execute(
            "SELECT service_id, mon, tue, wed, thu, fri, sat, sun, start_date, end_date FROM calendar"
        ):
            start = r["start_date"]
            end = r["end_date"]
            if not (start <= ymd <= end):
                continue
            weekday = d.weekday()  # 0=Mon
            flags = [r["mon"], r["tue"], r["wed"], r["thu"], r["fri"], r["sat"], r["sun"]]
            if flags[weekday]:
                services.add(r["service_id"])

        for r in conn.execute(
            "SELECT service_id, date, exception_type FROM calendar_dates WHERE date = ?", (ymd,)
        ):
            if r["exception_type"] == 1:
                services.add(r["service_id"])
            elif r["exception_type"] == 2 and r["service_id"] in services:
                services.remove(r["service_id"])

        if not services:
            _connections_cache[key] = []
            return []

        # Map stop_id (ATCO) -> area_id
        stop_to_area: Dict[str, int] = {}
        for r in conn.execute("SELECT stop_id, area_id FROM gtfs_stops"):
            if r["area_id"] is not None:
                stop_to_area[r["stop_id"]] = r["area_id"]

        # Load trips for active services
        trips: Dict[str, Dict] = {}
        for r in conn.execute(
            "SELECT trip_id, route_id, service_id, headsign FROM trips WHERE service_id IN (%s)"
            % ",".join("?" * len(services)),
            list(services),
        ):
            trips[r["trip_id"]] = {
                "route_id": r["route_id"],
                "service_id": r["service_id"],
                "headsign": r["headsign"],
            }

        if not trips:
            _connections_cache[key] = []
            return []

        # Build connections from stop_times
        connections: List[Connection] = []
        for trip_id in trips.keys():
            rows = list(
                conn.execute(
                    "SELECT seq, stop_id, arr_s, dep_s, dist_km, pickup_type, drop_off_type "
                    "FROM stop_times WHERE trip_id = ? ORDER BY seq",
                    (trip_id,),
                )
            )
            if len(rows) < 2:
                continue

            for i in range(len(rows) - 1):
                cur = rows[i]
                nxt = rows[i + 1]

                origin_atco = cur["stop_id"]
                dest_atco = nxt["stop_id"]
                from_area_id = stop_to_area.get(origin_atco)
                to_area_id = stop_to_area.get(dest_atco)
                if from_area_id is None or to_area_id is None:
                    continue

                # Respect pickup/drop-off rules
                if cur["drop_off_type"] == 1:
                    continue  # can't alight here
                if nxt["pickup_type"] == 1:
                    continue  # can't board next stop

                dep_s = cur["dep_s"]
                arr_s = nxt["arr_s"]
                dist_km = nxt["dist_km"] if nxt["dist_km"] is not None else 0.0

                connections.append(
                    Connection(
                        trip_id=trip_id,
                        route_id=trips[trip_id]["route_id"],
                        headsign=trips[trip_id]["headsign"],
                        origin_atco=origin_atco,
                        dest_atco=dest_atco,
                        from_area_id=from_area_id,
                        to_area_id=to_area_id,
                        dep_s=dep_s,
                        arr_s=arr_s,
                        dist_km=dist_km,
                    )
                )

    connections.sort(key=lambda c: c.dep_s)
    _connections_cache[key] = connections
    return connections


# ---------------------------------------------------------------------------
# Helpers for km + journey reconstruction
# ---------------------------------------------------------------------------

def _km_fallback(a: Area, b: Area) -> float:
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dp, dl = p2 - p1, math.radians(b.lon - a.lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h)) * ROAD_FACTOR


def _build_journey(
    d: date,
    areas: Dict[int, Area],
    origin_area_id: int,
    dest_area_id: int,
    depart_s: int,
    arrive_s: int,
    pred_conn: Dict[int, Optional[Connection]],
) -> Journey:
    legs: List[Leg] = []
    cur_area = dest_area_id

    while cur_area != origin_area_id:
        c = pred_conn.get(cur_area)
        if c is None:
            break
        from_area = areas[c.from_area_id]
        to_area = areas[c.to_area_id]
        dep_dt = _to_dt(d, c.dep_s)
        arr_dt = _to_dt(d, c.arr_s)
        km = c.dist_km
        if km <= 0 and from_area.lat is not None and to_area.lat is not None:
            km = _km_fallback(from_area, to_area)
        price = leg_price(c.route_id, c.origin_atco, c.dest_atco, online=True)

        legs.append(
            Leg(
                trip_id=c.trip_id,
                route_id=c.route_id,
                headsign=c.headsign,
                from_area=from_area,
                to_area=to_area,
                departure=dep_dt,
                arrival=arr_dt,
                dist_km=km,
                price_gbp=price,
            )
        )
        cur_area = c.from_area_id

    legs.reverse()
    total_km = sum(l.dist_km for l in legs)
    total_price = sum(l.price_gbp for l in legs if l.price_gbp is not None) or None
    changes = max(0, len(legs) - 1)

    return Journey(
        origin_area_id=origin_area_id,
        dest_area_id=dest_area_id,
        departure=_to_dt(d, depart_s),
        arrival=_to_dt(d, arrive_s),
        legs=legs,
        changes=changes,
        total_km=round(total_km, 1),
        price_gbp=round(total_price, 2) if total_price is not None else None,
    )


# ---------------------------------------------------------------------------
# Forward CSA: earliest_arrivals
# ---------------------------------------------------------------------------

def earliest_arrivals(origin_area: int, depart_after: datetime) -> dict[int, Journey]:
    """Earliest-arrival journey from `origin_area` to EVERY reachable area, leaving at/after `depart_after`.

    Returns {dest_area_id: Journey}. Origin itself is not included. `depart_after` is tz-aware (Europe/London).
    """
    areas = load_areas()
    if origin_area not in areas:
        return {}

    service_d = _service_date_from(depart_after)
    connections = _load_connections_for_date(service_d)
    if not connections:
        return {}

    depart_after_s = int(
        (depart_after.astimezone(TZ) - _midnight(service_d)).total_seconds()
    )

    INF = 10**12
    best_arr: Dict[int, int] = {aid: INF for aid in areas.keys()}
    pred_conn: Dict[int, Optional[Connection]] = {aid: None for aid in areas.keys()}

    best_arr[origin_area] = depart_after_s

    for c in connections:
        arr_from = best_arr[c.from_area_id]
        if arr_from == INF:
            continue

        # Need enough time to change (or stay on same trip)
        if arr_from > c.dep_s - MIN_CHANGE_S:
            continue

        new_arr = c.arr_s
        if new_arr < best_arr[c.to_area_id]:
            best_arr[c.to_area_id] = new_arr
            pred_conn[c.to_area_id] = c

    out: Dict[int, Journey] = {}
    for dest_area_id, arr_s in best_arr.items():
        if dest_area_id == origin_area:
            continue
        if arr_s == INF:
            continue
        out[dest_area_id] = _build_journey(
            service_d,
            areas,
            origin_area,
            dest_area_id,
            depart_after_s,
            arr_s,
            pred_conn,
        )
    return out


# ---------------------------------------------------------------------------
# Reverse CSA: latest_departures
# ---------------------------------------------------------------------------

def latest_departures(dest_area: int, arrive_by: datetime) -> dict[int, Journey]:
    """Latest-departing journey from EVERY area that still reaches `dest_area` by `arrive_by`.

    Returns {origin_area_id: Journey}. Destination itself is not included.
    """
    areas = load_areas()
    if dest_area not in areas:
        return {}

    service_d = _service_date_from(arrive_by)
    connections = _load_connections_for_date(service_d)
    if not connections:
        return {}

    arrive_by_s = int(
        (arrive_by.astimezone(TZ) - _midnight(service_d)).total_seconds()
    )

    NEG_INF = -1
    best_dep: Dict[int, int] = {aid: NEG_INF for aid in areas.keys()}
    pred_conn: Dict[int, Optional[Connection]] = {aid: None for aid in areas.keys()}

    best_dep[dest_area] = arrive_by_s

    for c in reversed(connections):
        arr_to = best_dep[c.to_area_id]
        if arr_to < 0:
            continue

        # Must arrive by arr_to; dep_s is fixed
        if c.arr_s > arr_to:
            continue

        new_dep = c.dep_s
        if new_dep > best_dep[c.from_area_id]:
            best_dep[c.from_area_id] = new_dep
            pred_conn[c.from_area_id] = c

    out: Dict[int, Journey] = {}
    for origin_area_id, dep_s in best_dep.items():
        if origin_area_id == dest_area:
            continue
        if dep_s < 0:
            continue

        # Walk forward from origin to dest to find final arrival_s
        cur_area = origin_area_id
        last_arr_s = arrive_by_s
        visited = set()
        while cur_area != dest_area and cur_area not in visited:
            visited.add(cur_area)
            c = pred_conn.get(cur_area)
            if c is None:
                break
            last_arr_s = c.arr_s
            cur_area = c.to_area_id

        if cur_area != dest_area:
            continue

        out[origin_area_id] = _build_journey(
            service_d,
            areas,
            origin_area_id,
            dest_area,
            dep_s,
            last_arr_s,
            pred_conn,
        )
    return out


# ---------------------------------------------------------------------------
# Quick manual check
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    t = datetime(2026, 10, 10, 8, 0, tzinfo=TZ)
    res = earliest_arrivals(13, t)  # 13 = Dundee (City Centre) in your data
    print(len(res), "reachable; Dundee -> Edinburgh:", res.get(42))

def debug_journey(j):
    print(f"\nJourney {j.origin_area_id} → {j.dest_area_id}")
    for leg in j.legs:
        print(
            f"  {leg.trip_id}: {leg.from_area.name} → {leg.to_area.name} "
            f"{leg.departure.time()}–{leg.arrival.time()} ({leg.dist_km} km)"
        )
    print(f"Total km={j.total_km}, changes={j.changes}, price={j.price_gbp}")
x