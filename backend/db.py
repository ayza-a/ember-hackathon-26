"""SQLite connection + schema. FROZEN SHARED FILE: change only by team agreement (additive only)."""
import sqlite3
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "ember.db"
TZ = ZoneInfo("Europe/London")
EMBER_API = "https://api.ember.to"

SCHEMA = """
-- Ember stations (STOP_AREA). lat/lon = mean of their stop points. Meetings & changes happen here.
CREATE TABLE IF NOT EXISTS areas (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    region_name TEXT,
    lat REAL,
    lon REAL,
    has_future_activity INTEGER DEFAULT 1,
    popularity INTEGER          -- 0 = most booked (Ember returns locations by booking popularity)
);

-- Ember stances (STOP_POINT). atco = GTFS stop_id.
CREATE TABLE IF NOT EXISTS stop_points (
    id INTEGER PRIMARY KEY,
    atco TEXT,
    area_id INTEGER REFERENCES areas(id),
    name TEXT,
    lat REAL,
    lon REAL
);
CREATE INDEX IF NOT EXISTS ix_stop_points_atco ON stop_points(atco);

-- GTFS
CREATE TABLE IF NOT EXISTS gtfs_stops (
    stop_id TEXT PRIMARY KEY,   -- ATCO code
    name TEXT,
    lat REAL,
    lon REAL,
    area_id INTEGER             -- resolved via stop_points.atco (or nearest area); NULL if unknown
);
CREATE TABLE IF NOT EXISTS routes (
    route_id TEXT PRIMARY KEY,  -- e.g. E1
    long_name TEXT,
    color TEXT
);
CREATE TABLE IF NOT EXISTS trips (
    trip_id TEXT PRIMARY KEY,
    route_id TEXT,
    service_id TEXT,
    headsign TEXT,
    direction_id INTEGER,
    shape_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_trips_service ON trips(service_id);
CREATE TABLE IF NOT EXISTS stop_times (
    trip_id TEXT,
    seq INTEGER,
    stop_id TEXT,               -- ATCO code
    arr_s INTEGER,              -- seconds after midnight of service date (may exceed 86400)
    dep_s INTEGER,
    dist_km REAL,
    pickup_type INTEGER,        -- 1 = no boarding
    drop_off_type INTEGER,      -- 1 = no alighting
    PRIMARY KEY (trip_id, seq)
);
CREATE TABLE IF NOT EXISTS calendar (
    service_id TEXT PRIMARY KEY,
    mon INTEGER, tue INTEGER, wed INTEGER, thu INTEGER, fri INTEGER, sat INTEGER, sun INTEGER,
    start_date TEXT,            -- YYYYMMDD
    end_date TEXT
);
CREATE TABLE IF NOT EXISTS calendar_dates (
    service_id TEXT,
    date TEXT,                  -- YYYYMMDD
    exception_type INTEGER      -- 1 = added, 2 = removed
);
CREATE INDEX IF NOT EXISTS ix_calendar_dates_date ON calendar_dates(date);
CREATE TABLE IF NOT EXISTS fares (
    route_id TEXT,
    origin_atco TEXT,
    dest_atco TEXT,
    price_gbp REAL,
    online INTEGER              -- 1 = online price, 0 = onboard price
);
CREATE INDEX IF NOT EXISTS ix_fares_od ON fares(origin_atco, dest_atco);
CREATE TABLE IF NOT EXISTS shapes (
    shape_id TEXT,
    seq INTEGER,
    lat REAL,
    lon REAL,
    dist_km REAL
);
CREATE INDEX IF NOT EXISTS ix_shapes ON shapes(shape_id, seq);

-- Discovery
CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    osm_id TEXT UNIQUE,         -- e.g. node/123; NULL for curated
    name TEXT NOT NULL,
    category TEXT NOT NULL,     -- cafe | food | pub | viewpoint | attraction | museum | castle | park | shop | walk
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    near_area_id INTEGER REFERENCES areas(id),
    distance_m INTEGER,         -- walking-ish distance from the area centre
    description TEXT,
    source TEXT NOT NULL,       -- osm | curated
    url TEXT
);
CREATE INDEX IF NOT EXISTS ix_places_area ON places(near_area_id);

-- App state
CREATE TABLE IF NOT EXISTS meetups (
    slug TEXT PRIMARY KEY,
    mode TEXT NOT NULL,         -- arrive | suggest
    title TEXT,
    date TEXT NOT NULL,         -- YYYY-MM-DD
    destination_area_id INTEGER,
    target_time TEXT,           -- ISO datetime (Europe/London)
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meetup_slug TEXT NOT NULL REFERENCES meetups(slug),
    name TEXT NOT NULL,
    origin_area_id INTEGER NOT NULL,
    earliest_departure TEXT,    -- ISO datetime, mode=suggest
    colour TEXT NOT NULL
);
"""


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)


@lru_cache(maxsize=1)
def load_areas() -> dict[int, "Area"]:
    """All Ember stations keyed by id, most popular first (cached; restart the server after re-importing)."""
    from backend.models import Area

    with get_conn() as conn:
        rows = conn.execute("SELECT id, name, region_name, lat, lon FROM areas ORDER BY popularity").fetchall()
    return {r["id"]: Area(**dict(r)) for r in rows}
