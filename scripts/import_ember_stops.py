"""Import Ember stations (areas) and stances (stop points) from the live API. Idempotent.

Usage: python scripts/import_ember_stops.py
"""
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from backend.db import EMBER_API, get_conn, init_db  # noqa: E402


def main() -> None:
    init_db()
    resp = httpx.get(f"{EMBER_API}/v1/locations/", params={"type": "all"}, timeout=60)
    resp.raise_for_status()
    locations = resp.json()

    areas = [l for l in locations if l["type"] == "STOP_AREA"]
    points = [l for l in locations if l["type"] == "STOP_POINT"]

    coords: dict[int, list[tuple[float, float]]] = defaultdict(list)
    for p in points:
        if p.get("area_id") and p.get("lat") is not None:
            coords[p["area_id"]].append((p["lat"], p["lon"]))

    with get_conn() as conn:
        conn.execute("DELETE FROM stop_points")
        conn.execute("DELETE FROM areas")
        conn.executemany(
            "INSERT INTO areas (id, name, region_name, lat, lon, has_future_activity, popularity) VALUES (?,?,?,?,?,?,?)",
            [
                (
                    a["id"],
                    a["name"],
                    a.get("region_name"),
                    sum(c[0] for c in coords[a["id"]]) / len(coords[a["id"]]) if coords[a["id"]] else a.get("lat"),
                    sum(c[1] for c in coords[a["id"]]) / len(coords[a["id"]]) if coords[a["id"]] else a.get("lon"),
                    int(bool(a.get("has_future_activity", True))),
                    rank,
                )
                for rank, a in enumerate(areas)
            ],
        )
        conn.executemany(
            "INSERT INTO stop_points (id, atco, area_id, name, lat, lon) VALUES (?,?,?,?,?,?)",
            [(p["id"], p.get("atco_code"), p.get("area_id"), p["name"], p.get("lat"), p.get("lon")) for p in points],
        )
        n_areas = conn.execute("SELECT COUNT(*) FROM areas").fetchone()[0]
        n_located = conn.execute("SELECT COUNT(*) FROM areas WHERE lat IS NOT NULL").fetchone()[0]
        n_points = conn.execute("SELECT COUNT(*) FROM stop_points").fetchone()[0]
    print(f"areas: {n_areas} ({n_located} with coordinates), stop_points: {n_points}")


if __name__ == "__main__":
    main()
