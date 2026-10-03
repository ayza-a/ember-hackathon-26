"""Timetable routing over GTFS (Connection Scan Algorithm). OWNER: workstream 1 (Routing).

FROZEN INTERFACE: keep the signatures of `earliest_arrivals` and `latest_departures` unchanged; the
planner (workstream 2) depends on them.

How it works
------------
A *connection* is one bus going between two consecutive stops of a trip. Every connection is kept,
because the bus really does drive it. Whether you may get on or off is stored as flags
(`can_board` / `can_alight`) and checked during the search:

* you can only BOARD a connection where `can_board` (pickup allowed at its departure stop);
* you can only ALIGHT after a connection where `can_alight` (drop-off allowed at its arrival stop).

Staying on a bus is free: once a trip has been boarded, every later connection of that trip can be
ridden with no change time. The 5-minute change rule only applies when boarding a *different* trip.
Consecutive connections on one trip are merged into a single Leg (board stop -> alight stop), so a
direct bus is one leg and `changes == len(legs) - 1`.

Times are seconds after midnight of the service date (Europe/London) and can exceed 86400. Night
buses that started on the previous service date and run past midnight are included.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta

from backend.db import TZ, get_conn, load_areas
from backend.fares import leg_price
from backend.models import Area, Journey, Leg

MIN_CHANGE_S = 5 * 60  # minimum time between getting off one bus and onto a different one
ROAD_FACTOR = 1.3      # straight-line -> road km, only used if shape_dist_traveled is missing
DAY_S = 24 * 3600

_INF = 10**9
_NEG_INF = -10**9


# ---------------------------------------------------------------------------
# Connection model + caches
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class Connection:
    trip_id: str        # real GTFS trip id (what ends up in Leg.trip_id)
    trip_key: str       # unique per running trip instance (trip_id, or trip_id + "|prev" for last night's)
    route_id: str
    headsign: str
    from_atco: str
    to_atco: str
    from_area: int
    to_area: int
    dep_s: int
    arr_s: int
    km_from: float | None  # cumulative shape_dist_traveled (km) at the departure stop
    km_to: float | None    # cumulative shape_dist_traveled (km) at the arrival stop
    can_board: bool        # pickup allowed at the departure stop
    can_alight: bool       # drop-off allowed at the arrival stop


@dataclass(slots=True)
class _Day:
    by_dep: list[Connection]       # ascending departure time (forward scan)
    by_arr_desc: list[Connection]  # descending arrival time (reverse scan)


_raw_cache: dict[str, list[Connection]] = {}  # service date -> that date's own connections
_day_cache: dict[str, _Day] = {}              # service date -> scan-ready connections incl. last night's


def clear_cache() -> None:
    """Drop cached connections (use after re-importing GTFS)."""
    _raw_cache.clear()
    _day_cache.clear()


def _active_services(conn, d: date) -> set[str]:
    ymd = d.strftime("%Y%m%d")
    services: set[str] = set()
    weekday = d.weekday()  # 0 = Monday
    for r in conn.execute(
        "SELECT service_id, mon, tue, wed, thu, fri, sat, sun, start_date, end_date FROM calendar"
    ):
        if not (r["start_date"] <= ymd <= r["end_date"]):
            continue
        if [r["mon"], r["tue"], r["wed"], r["thu"], r["fri"], r["sat"], r["sun"]][weekday]:
            services.add(r["service_id"])
    for r in conn.execute(
        "SELECT service_id, exception_type FROM calendar_dates WHERE date = ?", (ymd,)
    ):
        if r["exception_type"] == 1:
            services.add(r["service_id"])
        elif r["exception_type"] == 2:
            services.discard(r["service_id"])
    return services


def _make_connection(cur, nxt, stop_to_area: dict[str, int]) -> Connection | None:
    from_area = stop_to_area.get(cur["stop_id"])
    to_area = stop_to_area.get(nxt["stop_id"])
    if from_area is None or to_area is None:
        return None
    dep_s = cur["dep_s"] if cur["dep_s"] is not None else cur["arr_s"]
    arr_s = nxt["arr_s"] if nxt["arr_s"] is not None else nxt["dep_s"]
    if dep_s is None or arr_s is None:
        return None
    return Connection(
        trip_id=cur["trip_id"],
        trip_key=cur["trip_id"],
        route_id=cur["route_id"],
        headsign=cur["headsign"],
        from_atco=cur["stop_id"],
        to_atco=nxt["stop_id"],
        from_area=from_area,
        to_area=to_area,
        dep_s=dep_s,
        arr_s=arr_s,
        km_from=cur["dist_km"],
        km_to=nxt["dist_km"],
        # The first stop of most trips is drop-off-only and the last is pick-up-only. The bus still
        # drives the connection, so we never drop it: we only record who may get on / off.
        can_board=cur["pickup_type"] != 1,
        can_alight=nxt["drop_off_type"] != 1,
    )


def _raw_connections(d: date) -> list[Connection]:
    """All connections of trips whose service runs on date `d`, in (trip, stop sequence) order."""
    key = d.isoformat()
    hit = _raw_cache.get(key)
    if hit is not None:
        return hit

    out: list[Connection] = []
    with get_conn() as conn:
        services = _active_services(conn, d)
        if services:
            stop_to_area = {
                r["stop_id"]: r["area_id"]
                for r in conn.execute("SELECT stop_id, area_id FROM gtfs_stops WHERE area_id IS NOT NULL")
            }
            marks = ",".join("?" * len(services))
            # One query for the whole day (not one per trip).
            cursor = conn.execute(
                "SELECT st.trip_id, st.stop_id, st.arr_s, st.dep_s, st.dist_km, "
                "       st.pickup_type, st.drop_off_type, t.route_id, t.headsign "
                "FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id "
                f"WHERE t.service_id IN ({marks}) "
                "ORDER BY st.trip_id, st.seq",
                list(services),
            )
            prev = None
            for row in cursor:
                if prev is not None and prev["trip_id"] == row["trip_id"]:
                    c = _make_connection(prev, row, stop_to_area)
                    if c is not None:
                        out.append(c)
                prev = row

    _raw_cache[key] = out
    return out


def _day(d: date) -> _Day:
    key = d.isoformat()
    hit = _day_cache.get(key)
    if hit is not None:
        return hit

    conns = list(_raw_connections(d))
    # Night buses: trips of the previous service date still running after midnight appear on this
    # date with their times shifted back by 24h. They are different bus instances from today's.
    for c in _raw_connections(d - timedelta(days=1)):
        if c.dep_s >= DAY_S:
            conns.append(replace(c, trip_key=c.trip_key + "|prev", dep_s=c.dep_s - DAY_S, arr_s=c.arr_s - DAY_S))

    # Python's sort is stable, so connections of one trip keep their stop order when times tie.
    by_dep = sorted(conns, key=lambda c: c.dep_s)
    by_arr_desc = sorted(conns, key=lambda c: c.arr_s)
    by_arr_desc.reverse()  # ties end up latest-stop-first, which the reverse scan needs
    day = _Day(by_dep=by_dep, by_arr_desc=by_arr_desc)
    _day_cache[key] = day
    return day


def preload(d: date) -> None:
    """Build the connection cache for a date up front (call at app start / for the demo date)."""
    _day(d)


# ---------------------------------------------------------------------------
# Time + leg helpers
# ---------------------------------------------------------------------------

def _service_date(dt: datetime) -> date:
    return dt.astimezone(TZ).date()


def _midnight(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 0, 0, tzinfo=TZ)


def _to_dt(d: date, seconds: int) -> datetime:
    return _midnight(d) + timedelta(seconds=seconds)


def _seconds_into_day(dt: datetime, d: date) -> int:
    return int((dt.astimezone(TZ) - _midnight(d)).total_seconds())


def _km_fallback(a: Area, b: Area) -> float:
    if a.lat is None or b.lat is None:
        return 0.0
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dp, dl = p2 - p1, math.radians(b.lon - a.lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h)) * ROAD_FACTOR


def _make_leg(d: date, areas: dict[int, Area], board: Connection, alight: Connection) -> Leg:
    """One Leg = one bus ridden from `board` (first connection) to `alight` (last connection)."""
    from_area = areas[board.from_area]
    to_area = areas[alight.to_area]
    km = None
    if board.km_from is not None and alight.km_to is not None:
        km = alight.km_to - board.km_from  # shape_dist_traveled is cumulative, so subtract
    if km is None or km <= 0:
        km = _km_fallback(from_area, to_area)
    return Leg(
        trip_id=board.trip_id,
        route_id=board.route_id,
        headsign=board.headsign,
        from_area=from_area,
        to_area=to_area,
        departure=_to_dt(d, board.dep_s),
        arrival=_to_dt(d, alight.arr_s),
        dist_km=round(km, 1),
        # priced once per leg (board stop -> alight stop), not per stop-to-stop hop
        price_gbp=leg_price(board.route_id, board.from_atco, alight.to_atco, online=True),
    )


def _make_journey(origin: int, dest: int, legs: list[Leg]) -> Journey:
    prices = [l.price_gbp for l in legs if l.price_gbp is not None]
    total_price = sum(prices) if prices else None
    return Journey(
        origin_area_id=origin,
        dest_area_id=dest,
        departure=legs[0].departure,
        arrival=legs[-1].arrival,
        legs=legs,
        changes=len(legs) - 1,
        total_km=round(sum(l.dist_km for l in legs), 1),
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

    d = _service_date(depart_after)
    day = _day(d)
    if not day.by_dep:
        return {}
    start_s = _seconds_into_day(depart_after, d)

    arrival: dict[int, int] = {}                                  # area -> earliest arrival (s)
    arrival[origin_area] = start_s
    came_by: dict[int, tuple[Connection, Connection]] = {}        # area -> (boarding conn, alighting conn)
    on_trip: dict[str, Connection] = {}                           # trip_key -> connection we boarded it at
    get_arr = arrival.get

    for c in day.by_dep:
        board = on_trip.get(c.trip_key)
        if board is None:
            # Not on this bus yet: can we get on here?
            if not c.can_board:
                continue
            here = get_arr(c.from_area, _INF)
            if here >= _INF:
                continue
            # No change buffer at the very start of the journey; 5 min when switching buses.
            buffer_s = 0 if c.from_area == origin_area else MIN_CHANGE_S
            if here + buffer_s > c.dep_s:
                continue
            board = on_trip[c.trip_key] = c
        # We are on this bus. Staying on it needs no change time.
        if c.can_alight and c.arr_s < get_arr(c.to_area, _INF):
            arrival[c.to_area] = c.arr_s
            came_by[c.to_area] = (board, c)

    out: dict[int, Journey] = {}
    for dest in came_by:
        legs: list[Leg] = []
        area = dest
        for _ in range(len(areas) + 1):  # guard against any cycle
            step = came_by.get(area)
            if step is None:
                break
            board, alight = step
            legs.append(_make_leg(d, areas, board, alight))
            area = board.from_area
            if area == origin_area:
                break
        if area != origin_area or not legs:
            continue
        legs.reverse()
        out[dest] = _make_journey(origin_area, dest, legs)
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

    d = _service_date(arrive_by)
    day = _day(d)
    if not day.by_arr_desc:
        return {}
    deadline_s = _seconds_into_day(arrive_by, d)

    departure: dict[int, int] = {dest_area: deadline_s}           # area -> latest departure that still makes it (s)
    final_arr: dict[int, int] = {}                                # area -> arrival at dest of the stored journey (s)
    n_legs: dict[int, int] = {}                                   # area -> number of buses in the stored journey
    leaves_by: dict[int, tuple[Connection, Connection]] = {}      # area -> (boarding conn, alighting conn)
    # trip_key -> (connection we alight at, arrival at dest, buses from the alight point on incl. this one)
    off_trip: dict[str, tuple[Connection, int, int]] = {}
    get_dep = departure.get

    for c in day.by_arr_desc:  # latest arrival first
        if c.arr_s > deadline_s:
            continue
        best = off_trip.get(c.trip_key)
        # Can we get off here and still make it? Compare with the best alight point found so far on
        # this bus (which is later on the same trip): for the same boarding time we want the earlier
        # arrival, then fewer buses, so a bus that overshoots the destination loses to getting off early.
        if c.can_alight:
            if c.to_area == dest_area:
                cand = (c.arr_s, 1)  # no change buffer at the destination
            else:
                there = get_dep(c.to_area, _NEG_INF)
                cand = None
                if there > _NEG_INF and c.arr_s + MIN_CHANGE_S <= there:  # 5 min when the next bus is different
                    cand = (final_arr[c.to_area], n_legs[c.to_area] + 1)
            if cand is not None and (best is None or cand < (best[1], best[2])):
                best = off_trip[c.trip_key] = (c, cand[0], cand[1])
        if best is None or not c.can_board or c.from_area == dest_area:
            continue
        # This bus gets us there; we may board it here. Latest departure wins; on a tie prefer the
        # earlier arrival, then fewer changes.
        alight, fin, n_buses = best
        cur = get_dep(c.from_area, _NEG_INF)
        if c.dep_s > cur or (c.dep_s == cur and (fin, n_buses) < (final_arr[c.from_area], n_legs[c.from_area])):
            departure[c.from_area] = c.dep_s
            final_arr[c.from_area] = fin
            n_legs[c.from_area] = n_buses
            leaves_by[c.from_area] = (c, alight)

    out: dict[int, Journey] = {}
    for origin in leaves_by:
        if origin == dest_area:
            continue
        legs: list[Leg] = []
        area = origin
        for _ in range(len(areas) + 1):  # guard against any cycle
            step = leaves_by.get(area)
            if step is None:
                break
            board, alight = step
            legs.append(_make_leg(d, areas, board, alight))
            area = alight.to_area
            if area == dest_area:
                break
        if area != dest_area or not legs:
            continue
        out[origin] = _make_journey(origin, dest_area, legs)
    return out


if __name__ == "__main__":
    # Quick manual check: python -m backend.routing
    import time

    t = datetime(2026, 10, 10, 8, 0, tzinfo=TZ)
    t0 = time.perf_counter()
    res = earliest_arrivals(13, t)  # 13 = Dundee (City Centre)
    print(f"cold: {time.perf_counter() - t0:.2f}s")
    t0 = time.perf_counter()
    res = earliest_arrivals(13, t)
    print(f"warm: {time.perf_counter() - t0:.3f}s")
    j = res.get(42)  # 42 = Edinburgh
    print(len(res), "reachable; Dundee -> Edinburgh:", j and [(l.route_id, l.departure.time(), l.arrival.time()) for l in j.legs])