"""Route lines for the map + service update banner. OWNER: workstream 2 (Planner & API)."""
from fastapi import APIRouter

from backend import ember_client
from backend.db import load_areas
from backend.models import RouteLine, ServiceUpdate

router = APIRouter(prefix="/api", tags=["geo"])


@router.get("/routes/line", response_model=RouteLine)
def route_line(trip_id: str, from_area_id: int, to_area_id: int):
    """Line for one leg. STUB: straight line. Real: slice GTFS `shapes` by stop_times.dist_km
    (or use ember_client.trip_geography for Ember trip UIDs)."""
    areas = load_areas()
    a, b = areas[from_area_id], areas[to_area_id]
    return RouteLine(trip_id=trip_id, from_area_id=a.id, to_area_id=b.id, coordinates=[[a.lon, a.lat], [b.lon, b.lat]])


@router.get("/service-update", response_model=ServiceUpdate)
def service_update():
    try:
        return ServiceUpdate(**ember_client.service_update_summary())
    except Exception:
        return ServiceUpdate(type="none")
