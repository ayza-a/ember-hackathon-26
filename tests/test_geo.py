"""Route-line tests on the real imported timetable. OWNER: workstream 2. Run: pytest tests/ (needs data/ember.db)."""
import math

import pytest
from fastapi.testclient import TestClient

from backend.db import get_conn, load_areas
from backend.main import app
from backend.routers.geo import MAX_POINTS, _thin

client = TestClient(app)


def area_id(name: str) -> int:
    return next(a.id for a in load_areas().values() if a.name == name)


def km(lon1, lat1, lon2, lat2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


@pytest.fixture(scope="module")
def e8_trip() -> str:
    """Any trip that runs Inverness -> Aviemore -> Glasgow (the E8)."""
    inv, avi, gla = area_id("Inverness (City Centre)"), area_id("Aviemore Railway Station"), area_id("Glasgow Bus Station")
    with get_conn() as conn:
        return conn.execute(
            "SELECT a.trip_id FROM stop_times a JOIN gtfs_stops ga ON ga.stop_id = a.stop_id "
            "JOIN stop_times b ON b.trip_id = a.trip_id AND b.seq > a.seq JOIN gtfs_stops gb ON gb.stop_id = b.stop_id "
            "JOIN stop_times c ON c.trip_id = a.trip_id AND c.seq > b.seq JOIN gtfs_stops gc ON gc.stop_id = c.stop_id "
            "WHERE ga.area_id = ? AND gb.area_id = ? AND gc.area_id = ? LIMIT 1",
            (inv, avi, gla),
        ).fetchone()[0]


def line(trip_id: str, a: str, b: str) -> list:
    r = client.get("/api/routes/line", params={"trip_id": trip_id, "from_area_id": area_id(a), "to_area_id": area_id(b)})
    assert r.status_code == 200
    return r.json()["coordinates"]


def test_follows_the_road_between_the_two_stops(e8_trip):
    coords = line(e8_trip, "Inverness (City Centre)", "Glasgow Bus Station")
    assert 20 < len(coords) <= MAX_POINTS
    inv, gla = load_areas()[area_id("Inverness (City Centre)")], load_areas()[area_id("Glasgow Bus Station")]
    assert km(*coords[0], inv.lon, inv.lat) < 1.5
    assert km(*coords[-1], gla.lon, gla.lat) < 1.5
    path = sum(km(*p, *q) for p, q in zip(coords, coords[1:]))
    assert path > 1.15 * km(inv.lon, inv.lat, gla.lon, gla.lat)  # a real road, not a straight line


def test_part_of_a_trip_is_only_that_part(e8_trip):
    whole = line(e8_trip, "Inverness (City Centre)", "Glasgow Bus Station")
    part = line(e8_trip, "Aviemore Railway Station", "Glasgow Bus Station")
    avi = load_areas()[area_id("Aviemore Railway Station")]
    assert km(*part[0], avi.lon, avi.lat) < 1.5
    assert sum(km(*p, *q) for p, q in zip(part, part[1:])) < sum(km(*p, *q) for p, q in zip(whole, whole[1:]))


def test_unknown_trip_falls_back_to_a_straight_line():
    assert len(line("STUB-1-2", "Dundee (City Centre)", "Edinburgh (City Centre)")) == 2


def test_wrong_direction_falls_back_to_a_straight_line(e8_trip):
    assert len(line(e8_trip, "Glasgow Bus Station", "Inverness (City Centre)")) == 2


def test_unknown_station_is_404():
    r = client.get("/api/routes/line", params={"trip_id": "x", "from_area_id": -1, "to_area_id": -2})
    assert r.status_code == 404


def test_thin_keeps_ends_and_caps_points():
    pts = [[i, i] for i in range(1000)]
    out = _thin(pts, 150)
    assert len(out) == 150 and out[0] == pts[0] and out[-1] == pts[-1]
    assert _thin(pts[:10], 150) == pts[:10]
