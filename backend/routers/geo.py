"""Route lines for the map + service update banner. OWNER: workstream 2 (Planner & API)."""
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from backend import ember_client
from backend.db import get_conn, load_areas
from backend.models import RouteLine, ServiceUpdate

router = APIRouter(prefix="/api", tags=["geo"])

MAX_POINTS = 150  # per leg, so the map stays fast


@router.get("/routes/line", response_model=RouteLine)
def route_line(trip_id: str, from_area_id: int, to_area_id: int):
    """The road a leg actually follows: the trip's GTFS shape, cut between the boarding and alighting
    stops (by distance along the route) and thinned to at most MAX_POINTS points.
    Falls back to a straight line when the trip has no usable shape."""
    areas = load_areas()
    if from_area_id not in areas or to_area_id not in areas:
        raise HTTPException(404, "Unknown station")
    coords = _shape_between(trip_id, from_area_id, to_area_id)
    if not coords:
        a, b = areas[from_area_id], areas[to_area_id]
        coords = [[a.lon, a.lat], [b.lon, b.lat]]
    return RouteLine(trip_id=trip_id, from_area_id=from_area_id, to_area_id=to_area_id, coordinates=coords)


@lru_cache(maxsize=2048)
def _shape_between(trip_id: str, from_area_id: int, to_area_id: int) -> list[list[float]] | None:
    with get_conn() as conn:
        trip = conn.execute("SELECT shape_id FROM trips WHERE trip_id = ?", (trip_id,)).fetchone()
        if not trip or not trip["shape_id"]:
            return None
        stops = conn.execute(
            "SELECT st.seq, st.dist_km, g.area_id, g.lat, g.lon FROM stop_times st "
            "JOIN gtfs_stops g ON g.stop_id = st.stop_id WHERE st.trip_id = ? ORDER BY st.seq",
            (trip_id,),
        ).fetchall()
        # alight at the first stop in to_area that comes after a from_area stop; board at the last
        # from_area stop before it (a station can have several stances in a row)
        board = alight = None
        for s in stops:
            if s["area_id"] == from_area_id and alight is None:
                board = s
            elif s["area_id"] == to_area_id and board is not None:
                alight = s
                break
        if board is None or alight is None or alight["dist_km"] <= board["dist_km"]:
            return None
        pts = conn.execute(
            "SELECT lon, lat FROM shapes WHERE shape_id = ? AND dist_km BETWEEN ? AND ? ORDER BY seq",
            (trip["shape_id"], board["dist_km"], alight["dist_km"]),
        ).fetchall()
    line = [[board["lon"], board["lat"]], *([p["lon"], p["lat"]] for p in pts), [alight["lon"], alight["lat"]]]
    return [[round(x, 5), round(y, 5)] for x, y in _thin(line, MAX_POINTS)]


def _thin(points: list, max_points: int) -> list:
    """Keep every n-th point (always keeping both ends) so a line has at most max_points points."""
    if len(points) <= max_points:
        return points
    step = (len(points) - 1) / (max_points - 1)
    return [points[round(i * step)] for i in range(max_points)]


@router.get("/service-update", response_model=ServiceUpdate)
def service_update():
    try:
        return ServiceUpdate(**ember_client.service_update_summary())
    except Exception:
        return ServiceUpdate(type="none")
