"""Leg prices from the GTFS fares table. OWNER: workstream 1 (Routing).

The fares table (~29k rows) is loaded into a dict once, so a price lookup is a dict hit instead of a
new database connection plus query. Call `clear_cache()` after re-importing the GTFS data.
"""
from functools import lru_cache

from backend.db import get_conn


@lru_cache(maxsize=1)
def _fare_table() -> dict[tuple[str, str, str, int], float]:
    """{(route_id, origin_atco, dest_atco, online): cheapest adult price in GBP}."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT route_id, origin_atco, dest_atco, online, MIN(price_gbp) AS price "
            "FROM fares GROUP BY route_id, origin_atco, dest_atco, online"
        ).fetchall()
    return {
        (r[0], r[1], r[2], int(r[3])): r[4]
        for r in rows
        if r[4] is not None
    }


def clear_cache() -> None:
    """Forget the cached fares (use after refresh_all / re-importing GTFS)."""
    _fare_table.cache_clear()


def leg_price(route_id: str, origin_atco: str, dest_atco: str, online: bool = True) -> float | None:
    """Adult fare in GBP for one bus leg, or None if Ember has no fare for that pair."""
    return _fare_table().get((route_id, origin_atco, dest_atco, int(online)))