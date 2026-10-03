"""Import places near Ember stations from OpenStreetMap (Overpass) + curated_places.json. Idempotent.
OWNER: workstream 4 (Discovery).

Usage: python scripts/import_osm.py

STUB: only loads curated places. TODO (workstream 4):
  1. One Overpass query over the bbox of all areas (see OVERPASS_TAGS), e.g. POST https://overpass-api.de/api/interpreter
  2. For each element: map tags -> category, assign nearest area within MAX_DIST_M, upsert by osm_id
  3. Save the raw result to scripts/places_seed.json and fall back to it if Overpass is down
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.db import get_conn, init_db  # noqa: E402

HERE = Path(__file__).resolve().parent
MAX_DIST_M = 800
OVERPASS_TAGS = {
    "amenity": ["cafe", "restaurant", "pub", "ice_cream"],
    "tourism": ["viewpoint", "attraction", "museum", "artwork"],
    "historic": ["castle", "monument"],
    "leisure": ["park", "nature_reserve"],
    "shop": ["bakery", "books"],
}


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


def nearest_area(conn, lat: float, lon: float) -> tuple[int | None, int | None]:
    best, best_d = None, None
    for a in conn.execute("SELECT id, lat, lon FROM areas WHERE lat IS NOT NULL"):
        d = haversine_m(lat, lon, a["lat"], a["lon"])
        if best_d is None or d < best_d:
            best, best_d = a["id"], d
    return (best, int(best_d)) if best_d is not None and best_d <= MAX_DIST_M else (None, None)


def load_curated(conn) -> int:
    data = json.loads((HERE / "curated_places.json").read_text(encoding="utf-8"))
    conn.execute("DELETE FROM places WHERE source = 'curated'")
    for p in data["places"]:
        area_id, dist = nearest_area(conn, p["lat"], p["lon"])
        conn.execute(
            "INSERT INTO places (name, category, lat, lon, near_area_id, distance_m, description, source, url) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (p["name"], p["category"], p["lat"], p["lon"], area_id, dist, p.get("description"), "curated", p.get("url")),
        )
    return len(data["places"])


def main() -> None:
    init_db()
    with get_conn() as conn:
        n_curated = load_curated(conn)
        # TODO: import OSM places here
        total = conn.execute("SELECT COUNT(*) FROM places").fetchone()[0]
    print(f"curated: {n_curated}, places total: {total}")


if __name__ == "__main__":
    main()
