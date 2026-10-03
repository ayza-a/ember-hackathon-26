from fastapi import APIRouter, HTTPException
from backend.db import get_conn, load_areas
from backend.models import RouteLine
from backend.ember import ember_client

router = APIRouter(prefix="/geo", tags=["geo"])

def _decode_polyline(encoded):
    """Decode a polyline encoded with Google's algorithm."""
    coords = []
    index = lat = lng = 0

    while index < len(encoded):
        shift = result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if result & 1 else (result >> 1)
        lat += dlat

        shift = result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if result & 1 else (result >> 1)
        lng += dlng

        coords.append([lng / 1e5, lat / 1e5])

    return coords


@router.get("/route-line/{trip_id}/{from_atco}/{to_atco}")
def route_line(trip_id: str, from_atco: str, to_atco: str) -> RouteLine:
    """
    Fast hackathon version:
    - Fetch Ember trip geometry via API
    - Extract the polyline for the segment from_atco → to_atco
    - Decode and return coordinates
    """
    try:
        geo = ember_client.trip_geography(trip_id)
    except Exception:
        raise HTTPException(404, "Trip geometry not available")

    key = f"{from_atco}~{to_atco}"
    if key not in geo.paths:
        raise HTTPException(404, "Segment not found in trip geometry")

    encoded = geo.paths[key]
    coords = _decode_polyline(encoded)

    # Look up area IDs
    areas = load_areas()
    with get_conn() as conn:
        r1 = conn.execute("SELECT area_id FROM gtfs_stops WHERE stop_id = ?", (from_atco,)).fetchone()
        r2 = conn.execute("SELECT area_id FROM gtfs_stops WHERE stop_id = ?", (to_atco,)).fetchone()

    if not r1 or not r2:
        raise HTTPException(404, "Area lookup failed")

    return RouteLine(
        trip_id=trip_id,
        from_area_id=r1["area_id"],
        to_area_id=r2["area_id"],
        coordinates=coords,
    )
