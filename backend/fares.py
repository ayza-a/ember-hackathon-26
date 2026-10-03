"""Leg prices from the GTFS fares table. OWNER: workstream 1 (Routing)."""
from backend.db import get_conn


def leg_price(route_id: str, origin_atco: str, dest_atco: str, online: bool = True) -> float | None:
    """Adult fare in GBP for one bus leg, or None if Ember has no fare for that pair."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT MIN(price_gbp) FROM fares WHERE route_id=? AND origin_atco=? AND dest_atco=? AND online=?",
            (route_id, origin_atco, dest_atco, int(online)),
        ).fetchone()
    return row[0] if row else None
