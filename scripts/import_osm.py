"""Import places near Ember stations from OpenStreetMap (Overpass) + curated_places.json. Idempotent.
OWNER: workstream 4 (Discovery).

Usage: python scripts/import_osm.py [--offline]

  1. One Overpass query over the bbox of all areas (OVERPASS_TAGS); named places only.
  2. Map OSM tags -> app category, assign the nearest area within MAX_DIST_M, keep the
     MAX_PER_CATEGORY nearest per (area, category) so city centres don't drown everything else.
  3. The processed result is saved to scripts/places_seed.json (committed). If Overpass is down,
     or with --offline, we import from that seed instead.
Curated gems are assigned within CURATED_MAX_DIST_M: they're worth a longer walk.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from backend.db import get_conn, init_db  # noqa: E402

HERE = Path(__file__).resolve().parent
SEED_PATH = HERE / "places_seed.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
MAX_DIST_M = 800
CURATED_MAX_DIST_M = 2000
MAX_PER_CATEGORY = 8
BBOX_PAD_DEG = 0.01
OVERPASS_TAGS = {
    "amenity": ["cafe", "restaurant", "pub", "ice_cream"],
    "tourism": ["viewpoint", "attraction", "museum", "artwork"],
    "historic": ["castle", "monument"],
    "leisure": ["park", "nature_reserve"],
    "shop": ["bakery", "books"],
}
# OSM value -> app category (cafe | food | pub | viewpoint | attraction | museum | castle | park | shop | walk)
CATEGORY = {
    "cafe": "cafe", "ice_cream": "cafe", "restaurant": "food", "pub": "pub",
    "viewpoint": "viewpoint", "attraction": "attraction", "artwork": "attraction", "museum": "museum",
    "castle": "castle", "monument": "attraction",
    "park": "park", "nature_reserve": "park",
    "bakery": "shop", "books": "shop",
}


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


class AreaIndex:
    """Grid of areas so nearest-area lookups only check neighbouring cells (cells are ≥ 2 km)."""

    CELL_LAT, CELL_LON = 0.02, 0.04

    def __init__(self, conn):
        self.cells: dict[tuple[int, int], list[tuple[int, float, float]]] = {}
        for a in conn.execute("SELECT id, lat, lon FROM areas WHERE lat IS NOT NULL"):
            self.cells.setdefault(self._cell(a["lat"], a["lon"]), []).append((a["id"], a["lat"], a["lon"]))

    def _cell(self, lat, lon):
        return int(lat // self.CELL_LAT), int(lon // self.CELL_LON)

    def nearest(self, lat: float, lon: float, max_m: float) -> tuple[int | None, int | None]:
        ci, cj = self._cell(lat, lon)
        best, best_d = None, None
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for area_id, alat, alon in self.cells.get((ci + di, cj + dj), ()):
                    d = haversine_m(lat, lon, alat, alon)
                    if best_d is None or d < best_d:
                        best, best_d = area_id, d
        return (best, int(best_d)) if best_d is not None and best_d <= max_m else (None, None)


def load_curated(conn, index: AreaIndex) -> int:
    data = json.loads((HERE / "curated_places.json").read_text(encoding="utf-8"))
    conn.execute("DELETE FROM places WHERE source = 'curated'")
    for p in data["places"]:
        area_id, dist = index.nearest(p["lat"], p["lon"], CURATED_MAX_DIST_M)
        if area_id is None:
            print(f"  warning: curated place {p['name']!r} is not within {CURATED_MAX_DIST_M} m of any station")
        conn.execute(
            "INSERT INTO places (name, category, lat, lon, near_area_id, distance_m, description, source, url) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (p["name"], p["category"], p["lat"], p["lon"], area_id, dist, p.get("description"), "curated", p.get("url")),
        )
    return len(data["places"])


def overpass_query(conn) -> str:
    lat0, lat1, lon0, lon1 = conn.execute(
        "SELECT MIN(lat), MAX(lat), MIN(lon), MAX(lon) FROM areas WHERE lat IS NOT NULL"
    ).fetchone()
    bbox = f"{lat0 - BBOX_PAD_DEG},{lon0 - BBOX_PAD_DEG},{lat1 + BBOX_PAD_DEG},{lon1 + BBOX_PAD_DEG}"
    parts = [f'nwr["{key}"~"^({"|".join(vals)})$"]["name"];' for key, vals in OVERPASS_TAGS.items()]
    return f"[out:json][timeout:180][bbox:{bbox}];({''.join(parts)});out center tags;"


def fetch_osm(conn, index: AreaIndex) -> list[dict]:
    """Query Overpass and return processed places (near a station, capped per area+category)."""
    r = httpx.post(
        OVERPASS_URL,
        data={"data": overpass_query(conn)},
        headers={"User-Agent": "ember-group-journeys-hackathon/0.1"},
        timeout=240,
    )
    r.raise_for_status()
    elements = r.json()["elements"]
    print(f"  overpass: {len(elements)} named elements in bbox")

    by_bucket: dict[tuple[int, str], list[dict]] = {}
    for el in elements:
        tags = el.get("tags", {})
        lat = el.get("lat", el.get("center", {}).get("lat"))
        lon = el.get("lon", el.get("center", {}).get("lon"))
        category = next((CATEGORY[tags[k]] for k in OVERPASS_TAGS if tags.get(k) in CATEGORY), None)
        if lat is None or category is None:
            continue
        area_id, dist = index.nearest(lat, lon, MAX_DIST_M)
        if area_id is None:
            continue
        by_bucket.setdefault((area_id, category), []).append({
            "osm_id": f"{el['type']}/{el['id']}",
            "name": tags["name"],
            "category": category,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "description": tags.get("description"),
            "url": tags.get("website") or tags.get("contact:website"),
            "_dist": dist,
        })
    out = []
    for bucket in by_bucket.values():
        bucket.sort(key=lambda p: p["_dist"])
        out.extend({k: v for k, v in p.items() if k != "_dist"} for p in bucket[:MAX_PER_CATEGORY])
    out.sort(key=lambda p: p["osm_id"])  # stable seed file, small diffs between refreshes
    return out


def load_osm(conn, index: AreaIndex, rows: list[dict]) -> int:
    conn.execute("DELETE FROM places WHERE source = 'osm'")
    for p in rows:
        area_id, dist = index.nearest(p["lat"], p["lon"], MAX_DIST_M)
        if area_id is None:
            continue
        conn.execute(
            "INSERT OR REPLACE INTO places (osm_id, name, category, lat, lon, near_area_id, distance_m, description, source, url) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (p["osm_id"], p["name"], p["category"], p["lat"], p["lon"], area_id, dist, p.get("description"), "osm", p.get("url")),
        )
    return len(rows)


def main() -> None:
    offline = "--offline" in sys.argv
    init_db()
    with get_conn() as conn:
        index = AreaIndex(conn)
        n_curated = load_curated(conn, index)

        rows = None
        if not offline:
            try:
                rows = fetch_osm(conn, index)
                SEED_PATH.write_text(json.dumps({"places": rows}, ensure_ascii=False, indent=0), encoding="utf-8")
            except (httpx.HTTPError, ValueError, KeyError) as e:
                print(f"  overpass failed ({e!r}); falling back to {SEED_PATH.name}")
        if rows is None:
            rows = json.loads(SEED_PATH.read_text(encoding="utf-8"))["places"] if SEED_PATH.exists() else []
        n_osm = load_osm(conn, index, rows)

        total = conn.execute("SELECT COUNT(*) FROM places").fetchone()[0]
        n_areas = conn.execute("SELECT COUNT(DISTINCT near_area_id) FROM places").fetchone()[0]
    print(f"curated: {n_curated}, osm: {n_osm}, places total: {total} across {n_areas} stations")


if __name__ == "__main__":
    main()
