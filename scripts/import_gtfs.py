"""Download Ember's GTFS static timetable and load it into SQLite. Idempotent.

Run import_ember_stops.py first (GTFS stops are mapped to Ember areas via ATCO code).

Usage: python scripts/import_gtfs.py [--refresh]   (--refresh re-downloads the 51 MB zip)
"""
import csv
import io
import math
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from backend.db import DATA_DIR, EMBER_API, get_conn, init_db  # noqa: E402

ZIP_PATH = DATA_DIR / "gtfs.zip"
NEAREST_AREA_MAX_M = 300  # fallback when a GTFS stop's ATCO code isn't in Ember's stop list


def to_secs(hms: str) -> int:
    h, m, s = (int(x) for x in hms.split(":"))
    return h * 3600 + m * 60 + s


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def read(zf: zipfile.ZipFile, name: str):
    with zf.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def download(refresh: bool) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    if ZIP_PATH.exists() and not refresh:
        return
    print("downloading GTFS…")
    with httpx.stream("GET", f"{EMBER_API}/v1/gtfs/static/", timeout=300, follow_redirects=True) as r:
        r.raise_for_status()
        with open(ZIP_PATH, "wb") as out:
            for chunk in r.iter_bytes():
                out.write(chunk)


def main() -> None:
    download("--refresh" in sys.argv)
    init_db()
    zf = zipfile.ZipFile(ZIP_PATH)
    with get_conn() as conn:
        for t in ("gtfs_stops", "routes", "trips", "stop_times", "calendar", "calendar_dates", "fares", "shapes"):
            conn.execute(f"DELETE FROM {t}")

        # stops -> areas
        atco_to_area = {r["atco"]: r["area_id"] for r in conn.execute("SELECT atco, area_id FROM stop_points WHERE atco IS NOT NULL")}
        areas = [tuple(r) for r in conn.execute("SELECT id, lat, lon FROM areas WHERE lat IS NOT NULL")]
        stops, unmapped = [], 0
        for s in read(zf, "stops.txt"):
            lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
            area_id = atco_to_area.get(s["stop_id"])
            if area_id is None and areas:
                best = min(areas, key=lambda a: haversine_m(lat, lon, a[1], a[2]))
                if haversine_m(lat, lon, best[1], best[2]) <= NEAREST_AREA_MAX_M:
                    area_id = best[0]
            unmapped += area_id is None
            stops.append((s["stop_id"], s["stop_name"], lat, lon, area_id))
        conn.executemany("INSERT INTO gtfs_stops VALUES (?,?,?,?,?)", stops)

        conn.executemany(
            "INSERT INTO routes VALUES (?,?,?)",
            [(r["route_id"], r["route_long_name"], r.get("route_color")) for r in read(zf, "routes.txt")],
        )
        conn.executemany(
            "INSERT INTO trips VALUES (?,?,?,?,?,?)",
            [
                (r["trip_id"], r["route_id"], r["service_id"], r.get("trip_headsign"), int(r.get("direction_id") or 0), r.get("shape_id"))
                for r in read(zf, "trips.txt")
            ],
        )
        conn.executemany(
            "INSERT OR REPLACE INTO stop_times VALUES (?,?,?,?,?,?,?,?)",
            (
                (
                    r["trip_id"],
                    int(r["stop_sequence"]),
                    r["stop_id"],
                    to_secs(r["arrival_time"]),
                    to_secs(r["departure_time"]),
                    float(r.get("shape_dist_traveled") or 0),
                    int(r.get("pickup_type") or 0),
                    int(r.get("drop_off_type") or 0),
                )
                for r in read(zf, "stop_times.txt")
            ),
        )
        conn.executemany(
            "INSERT INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
                (r["service_id"], *(int(r[d]) for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")),
                 r["start_date"], r["end_date"])
                for r in read(zf, "calendar.txt")
            ],
        )
        conn.executemany(
            "INSERT INTO calendar_dates VALUES (?,?,?)",
            [(r["service_id"], r["date"], int(r["exception_type"])) for r in read(zf, "calendar_dates.txt")],
        )

        # fares: adult only; fare_id like "Adult-1660-online" / "Adult-3640-onboard"
        prices = {r["fare_id"]: float(r["price"]) for r in read(zf, "fare_attributes.txt") if r["fare_id"].startswith("Adult")}
        conn.executemany(
            "INSERT INTO fares VALUES (?,?,?,?,?)",
            (
                (r["route_id"], r["origin_id"], r["destination_id"], prices[r["fare_id"]], int(r["fare_id"].endswith("online")))
                for r in read(zf, "fare_rules.txt")
                if r["fare_id"] in prices
            ),
        )
        conn.executemany(
            "INSERT INTO shapes VALUES (?,?,?,?,?)",
            (
                (r["shape_id"], int(r["shape_pt_sequence"]), float(r["shape_pt_lat"]), float(r["shape_pt_lon"]), float(r.get("shape_dist_traveled") or 0))
                for r in read(zf, "shapes.txt")
            ),
        )

        counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                  for t in ("gtfs_stops", "routes", "trips", "stop_times", "calendar", "calendar_dates", "fares", "shapes")}
    print(", ".join(f"{k}: {v}" for k, v in counts.items()))
    print(f"GTFS stops not mapped to an Ember area: {unmapped}")


if __name__ == "__main__":
    main()
