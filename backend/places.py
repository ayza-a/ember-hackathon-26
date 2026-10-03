"""Places to discover near Ember stations. OWNER: workstream 4 (Discovery).

FROZEN INTERFACE: `places_near` and `summary` signatures are used by the planner (workstream 2).
Data comes from the `places` table, filled by scripts/import_osm.py + scripts/curated_places.json.

Each place is stored against its single nearest stop, but town centres have several stops a few
hundred metres apart (Edinburgh City Centre / Bus Station / Princes St...). So we search by
distance from the requested area instead: OSM places within OSM_RADIUS_M, curated gems within
CURATED_RADIUS_M (worth a longer walk), with near_area_id/distance_m re-anchored to that area.
"""
import math

from backend.db import get_conn, load_areas
from backend.models import Place

OSM_RADIUS_M = 800
CURATED_RADIUS_M = 2000


def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


def _rows_near(area_id: int, category: str | None = None) -> list[dict]:
    """Places within walking distance of `area_id`, re-anchored to it (near_area_id + distance_m)."""
    a = load_areas().get(area_id)
    if a is None or a.lat is None:
        return []
    dlat = CURATED_RADIUS_M / 111_000
    dlon = dlat / math.cos(math.radians(a.lat))
    q = "SELECT * FROM places WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?"
    args: list = [a.lat - dlat, a.lat + dlat, a.lon - dlon, a.lon + dlon]
    if category:
        q += " AND category = ?"
        args.append(category)
    out = []
    with get_conn() as conn:
        for r in conn.execute(q, args):
            r = dict(r)
            d = _haversine_m(a.lat, a.lon, r["lat"], r["lon"])
            if d <= (CURATED_RADIUS_M if r["source"] == "curated" else OSM_RADIUS_M):
                r["near_area_id"], r["distance_m"] = area_id, int(d)
                out.append(r)
    return out


def places_near(area_ids: list[int], category: str | None = None, limit: int = 20) -> list[Place]:
    """Places near any of `area_ids`; curated first, then nearest."""
    best: dict[int, dict] = {}  # place id -> row anchored to its closest requested area
    for area_id in dict.fromkeys(area_ids):
        for r in _rows_near(area_id, category):
            prev = best.get(r["id"])
            if prev is None or (r["distance_m"] or 0) < (prev["distance_m"] or 0):
                best[r["id"]] = r
    rows = sorted(best.values(), key=lambda r: (r["source"] != "curated", r["distance_m"] or 0))
    return [Place(**{k: v for k, v in r.items() if k != "osm_id"}) for r in rows[:limit]]


def summary(area_ids: list[int]) -> dict[int, dict[str, int]]:
    """{area_id: {category: count}} for each of `area_ids` (areas with no places are omitted)."""
    out: dict[int, dict[str, int]] = {}
    for area_id in dict.fromkeys(area_ids):
        counts: dict[str, int] = {}
        for r in _rows_near(area_id):
            counts[r["category"]] = counts.get(r["category"], 0) + 1
        if counts:
            out[area_id] = counts
    return out
