"""Thin cached wrapper over Ember's live API. OWNER: workstream 2 (Planner & API).

Production API: cache everything, keep volume low, NEVER call order/payment/account endpoints.
"""
import time

import httpx

from backend.db import EMBER_API

_client = httpx.Client(base_url=EMBER_API, timeout=20)
_cache: dict[str, tuple[float, object]] = {}


def _get(path: str, params: dict | None = None, ttl: int = 300):
    key = path + "?" + "&".join(f"{k}={v}" for k, v in sorted((params or {}).items()))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    r = _client.get(path, params=params)
    r.raise_for_status()
    data = r.json()
    _cache[key] = (time.time(), data)
    return data


def service_update_summary() -> dict:
    return _get("/v1/service-updates/summary/", ttl=120)


def trip_geography(trip_uid: str) -> dict:
    """{'id', 'stops': [location ids], 'paths': {'<from>~<to>': encoded polyline (precision 6, lon/lat)}}"""
    return _get(f"/v1/trips/{trip_uid}/geography/", ttl=3600)


def quotes(origin: int, destination: int, dep_from: str, dep_to: str, adult: int = 1) -> dict:
    """Direct journeys only (Ember doesn't support connections in quotes)."""
    return _get("/v1/quotes/", {"origin": origin, "destination": destination, "departure_date_from": dep_from,
                                "departure_date_to": dep_to, "adult": adult}, ttl=300)
