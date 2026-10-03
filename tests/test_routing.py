"""Routing tests, run against the real imported Ember timetable.  OWNER: workstream 1 (Routing).
 
Run:  pytest tests/test_routing.py
 
All tests use Saturday 10 Oct 2026. Area ids that are known are pinned below; everything else is
looked up by name so a re-import with different ids does not break the suite.
"""
import time
from datetime import datetime
 
import pytest
 
from backend.db import TZ, get_conn, load_areas
from backend.fares import leg_price
from backend.routing import earliest_arrivals, latest_departures, preload
 
# Known ids in the imported dataset.
DUNDEE = 13       # Dundee (City Centre)
EDINBURGH = 42
OBAN = 1346       # Oban Bus Station
 
 
def _dt(h, m=0):
    """Timezone-aware datetime on the fixed test date."""
    return datetime(2026, 10, 10, h, m, tzinfo=TZ)
 
 
def _hm(dt):
    return dt.strftime("%H:%M")
 
 
def _area_by_name(needle):
    """Id of the area whose name contains `needle`; prefers 'Bus Station', then the shortest name."""
    needle = needle.lower()
    hits = [a for a in load_areas().values() if a.name and needle in a.name.lower()]
    if not hits:
        return None
    hits.sort(key=lambda a: (0 if "bus station" in a.name.lower() else 1, len(a.name)))
    return hits[0].id
 
 
def _need(needle):
    area_id = _area_by_name(needle)
    if area_id is None:
        pytest.skip(f"no area matching {needle!r} in this database")
    return area_id
 
 
def _need_exact(name):
    """Id of the area whose name is exactly `name` (case-insensitive). Use this when a substring such
    as 'elgin' matches several stops (five Elgin stops exist; only one is the railway station)."""
    hits = [a for a in load_areas().values() if a.name and a.name.lower() == name.lower()]
    if not hits:
        pytest.skip(f"no area named {name!r} in this database")
    return hits[0].id
 
 
@pytest.fixture(scope="module", autouse=True)
def _warm_caches():
    """Build the connection cache once so timing tests measure the warm path."""
    preload(_dt(8).date())
    leg_price("", "", "")  # loads the fares table
 
 
# --------------------------------------------------------------------------- basics
 
def test_forward_csa_direct_route():
    """Dundee -> Edinburgh is a single direct bus."""
    res = earliest_arrivals(DUNDEE, _dt(8))
    assert EDINBURGH in res, "Edinburgh should be reachable from Dundee"
    j = res[EDINBURGH]
    assert j.origin_area_id == DUNDEE and j.dest_area_id == EDINBURGH
    assert len(j.legs) == 1, f"expected one direct bus, got {len(j.legs)} legs"
    assert j.changes == 0
 
 
def test_reverse_csa_direct_route():
    res = latest_departures(EDINBURGH, _dt(12))
    assert DUNDEE in res, "Dundee should reach Edinburgh by 12:00"
    j = res[DUNDEE]
    assert j.origin_area_id == DUNDEE and j.dest_area_id == EDINBURGH
    assert len(j.legs) == 1 and j.changes == 0
    assert j.arrival <= _dt(12)
 
 
def test_oban_to_dundee_requires_change():
    res = earliest_arrivals(OBAN, _dt(7))
    assert DUNDEE in res, "Dundee must be reachable from Oban"
    j = res[DUNDEE]
    assert len(j.legs) >= 2, "Oban -> Dundee should need at least one change"
    assert j.changes >= 1
 
 
# --------------------------------------------------------------------------- bug regressions
 
def test_stays_on_the_same_bus():
    """A bus passing through many stops is ONE leg, not one leg per stop (was 12 legs)."""
    glasgow = _need("glasgow")
    j = earliest_arrivals(DUNDEE, _dt(8))[glasgow]
    assert len(j.legs) <= 3, f"Dundee -> Glasgow came out as {len(j.legs)} legs"
    for a, b in zip(j.legs, j.legs[1:]):
        assert a.trip_id != b.trip_id, "consecutive legs on the same trip should be merged"
    assert j.changes == len(j.legs) - 1
 
 
def test_dundee_to_glasgow_by_1600_is_the_direct_e3():
    """Glasgow by 16:00 from Dundee: E3 13:49 -> 15:51."""
    glasgow = _need("glasgow")
    j = latest_departures(glasgow, _dt(16))[DUNDEE]
    assert len(j.legs) == 1
    leg = j.legs[0]
    assert "E3" in str(leg.route_id)
    assert (_hm(leg.departure), _hm(leg.arrival)) == ("13:49", "15:51")
 
 
def test_equal_departures_prefer_earlier_arrival_and_fewer_changes():
    """Glasgow -> Dunblane by 12:10: when several journeys leave at the same time, take the one that
    arrives earliest (then fewest changes), not the detour via Greenloaning."""
    glasgow, dunblane = _need("glasgow"), _need("dunblane")
    j = latest_departures(dunblane, _dt(12, 10))[glasgow]
    visited = [l.from_area.name.lower() for l in j.legs] + [l.to_area.name.lower() for l in j.legs]
    assert not any("greenloaning" in n for n in visited), f"detour via Greenloaning: {visited}"
    assert j.arrival <= _dt(12, 10)
 
 
def test_first_and_last_stops_of_trips_are_not_dropped():
    """Most trips start at a drop-off-only stop and end at a pick-up-only stop. Those hops must exist,
    otherwise Glasgow is served by almost nothing."""
    glasgow = _need("glasgow")
    last_buses = set()
    for hour in range(6, 19):
        j = earliest_arrivals(DUNDEE, _dt(hour)).get(glasgow)
        if j:
            last_buses.add(j.legs[-1].trip_id)
    assert len(last_buses) >= 3, f"only {len(last_buses)} distinct bus(es) reach Glasgow from Dundee all day"
 
 
def test_distance_is_per_leg_not_cumulative():
    j = earliest_arrivals(DUNDEE, _dt(8))[EDINBURGH]
    assert j.total_km == pytest.approx(sum(l.dist_km for l in j.legs), abs=0.2)
    assert 30 < j.total_km < 250, f"Dundee -> Edinburgh reported as {j.total_km} km"
    assert all(0 < l.dist_km < 500 for l in j.legs)
 
 
def test_change_time_respected():
    """Every journey from Oban keeps >= 5 min between different buses."""
    res = earliest_arrivals(OBAN, _dt(7))
    assert res
    for dest, j in res.items():
        for a, b in zip(j.legs, j.legs[1:]):
            gap = (b.departure - a.arrival).total_seconds()
            assert gap >= 5 * 60, f"{gap / 60:.0f} min change on the way to area {dest}"
            assert a.to_area.id == b.from_area.id, "legs must join up at the change station"
 
 
def _allowed(conn, trip_id, area_id, column):
    return conn.execute(
        f"SELECT 1 FROM stop_times st JOIN gtfs_stops g ON g.stop_id = st.stop_id "
        f"WHERE st.trip_id = ? AND g.area_id = ? AND st.{column} != 1 LIMIT 1",
        (trip_id, area_id),
    ).fetchone() is not None
 
 
def test_pickup_dropoff_rules():
    """Every leg boards where pickup is allowed and alights where drop-off is allowed."""
    journeys = list(earliest_arrivals(OBAN, _dt(7)).values())[:60]
    journeys += list(latest_departures(EDINBURGH, _dt(12)).values())[:60]
    assert journeys
    with get_conn() as conn:
        for j in journeys:
            for leg in j.legs:
                assert _allowed(conn, leg.trip_id, leg.from_area.id, "pickup_type"), (
                    f"boarded {leg.trip_id} at {leg.from_area.name} where pickup is not allowed")
                assert _allowed(conn, leg.trip_id, leg.to_area.id, "drop_off_type"), (
                    f"alighted {leg.trip_id} at {leg.to_area.name} where drop-off is not allowed")
 
 
def test_journey_reconstruction_is_consistent():
    depart = _dt(8)
    j = earliest_arrivals(DUNDEE, depart)[EDINBURGH]
    assert j.departure >= depart
    assert j.arrival > j.departure
    assert j.departure == j.legs[0].departure and j.arrival == j.legs[-1].arrival
    for leg in j.legs:
        assert leg.arrival > leg.departure
    for a, b in zip(j.legs, j.legs[1:]):
        assert a.arrival <= b.departure
 
 
def test_forward_and_reverse_consistency():
    """Reverse search can leave at least as late as the forward journey, and the forward search
    replayed from that departure still arrives on time."""
    fwd = earliest_arrivals(DUNDEE, _dt(8))[EDINBURGH]
    rev = latest_departures(EDINBURGH, fwd.arrival)[DUNDEE]
    assert rev.departure >= fwd.departure
    assert rev.arrival <= fwd.arrival
    replay = earliest_arrivals(DUNDEE, rev.departure)[EDINBURGH]
    assert replay.arrival <= fwd.arrival
 
 
# --------------------------------------------------------------------------- fares + speed
 
def test_price_is_per_leg():
    j = earliest_arrivals(DUNDEE, _dt(8))[EDINBURGH]
    priced = [l.price_gbp for l in j.legs if l.price_gbp is not None]
    if priced:
        assert j.price_gbp == pytest.approx(sum(priced), abs=0.01)
 
 
def test_fare_lookups_are_fast():
    start = time.perf_counter()
    for _ in range(20000):
        leg_price("E3", "x", "y")
    assert time.perf_counter() - start < 0.5
 
 
def test_searches_take_well_under_a_second():
    for fn, arg, when in ((earliest_arrivals, DUNDEE, _dt(8)), (latest_departures, EDINBURGH, _dt(12))):
        fn(arg, when)  # warm
        start = time.perf_counter()
        fn(arg, when)
        elapsed = time.perf_counter() - start
        assert elapsed < 1.0, f"{fn.__name__} took {elapsed:.2f}s"
 
 
# --------------------------------------------------------------------------- demo scenario
 
def test_demo_glasgow_by_1600_group():
    """Glasgow by 16:00 for Isla (Thurso), Ewan (Elgin), Mhairi (Aviemore), Ben (Dundee), Anna (Aberdeen).
 
    Isla and Ewan should change at Inverness; Mhairi should hop on the bus they are on at Aviemore.
    """
    glasgow, thurso = _need("glasgow"), _need("thurso")
    elgin = _need_exact("Elgin Railway Station")  # not _need("elgin"): that matches five different stops
    aviemore, inverness = _need("aviemore"), _need("inverness")
 
    best = latest_departures(glasgow, _dt(16))
    isla, ewan, mhairi = best.get(thurso), best.get(elgin), best.get(aviemore)
    assert isla and ewan and mhairi, "Thurso, Elgin and Aviemore should all reach Glasgow by 16:00"
    assert DUNDEE in best
 
    def changes_at_inverness(j):
        for a, b in zip(j.legs, j.legs[1:]):
            if a.to_area.id == inverness and b.from_area.id == inverness:
                return (a.arrival, b.departure)
        return None
 
    isla_wait, ewan_wait = changes_at_inverness(isla), changes_at_inverness(ewan)
    assert isla_wait and ewan_wait, "Isla and Ewan should both change at Inverness"
    assert max(isla_wait[0], ewan_wait[0]) < min(isla_wait[1], ewan_wait[1]), (
        "their waiting windows at Inverness should overlap")
 
    shared = {l.trip_id for j in (isla, ewan) for l in j.legs}
    assert mhairi.legs[0].from_area.id == aviemore
    assert mhairi.legs[0].trip_id in shared, "Mhairi should board a bus Isla or Ewan is on"
 