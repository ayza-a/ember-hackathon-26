"""Places to discover near Ember stations. OWNER: workstream 4 (Discovery).

FROZEN INTERFACE: `places_near` and `summary` signatures are used by the planner (workstream 2).
Data comes from the `places` table, filled by scripts/import_osm.py + scripts/curated_places.json.
"""
from backend.db import get_conn
from backend.models import Place


def places_near(area_ids: list[int], category: str | None = None, limit: int = 20) -> list[Place]:
    """Places assigned to any of `area_ids`; curated first, then nearest."""
    if not area_ids:
        return []
    q = f"SELECT * FROM places WHERE near_area_id IN ({','.join('?' * len(area_ids))})"
    args: list = list(area_ids)
    if category:
        q += " AND category = ?"
        args.append(category)
    q += " ORDER BY source = 'curated' DESC, distance_m ASC LIMIT ?"
    args.append(limit)
    with get_conn() as conn:
        return [Place(**dict(r)) for r in conn.execute(q, args)]


def summary(area_ids: list[int]) -> dict[int, dict[str, int]]:
    """{area_id: {category: count}} for each of `area_ids` (areas with no places are omitted)."""
    if not area_ids:
        return {}
    out: dict[int, dict[str, int]] = {}
    with get_conn() as conn:
        for r in conn.execute(
            f"SELECT near_area_id, category, COUNT(*) n FROM places WHERE near_area_id IN ({','.join('?' * len(area_ids))}) "
            "GROUP BY near_area_id, category",
            area_ids,
        ):
            out.setdefault(r["near_area_id"], {})[r["category"]] = r["n"]
    return out
