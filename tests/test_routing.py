"""Routing sanity checks. OWNER: workstream 1. Run: pytest tests/ (needs data/ember.db imported)."""
from datetime import datetime

import pytest

from backend.db import TZ, get_conn
from backend.routing import earliest_arrivals, latest_departures


def area_id(name: str) -> int:
    with get_conn() as conn:
        return conn.execute("SELECT id FROM areas WHERE name = ?", (name,)).fetchone()[0]


T = datetime(2026, 10, 10, 8, 0, tzinfo=TZ)  # a Saturday


def test_dundee_to_edinburgh_is_reachable():
    res = earliest_arrivals(area_id("Dundee (City Centre)"), T)
    j = res[area_id("Edinburgh (City Centre)")]
    assert j.departure >= T
    assert j.arrival > j.departure
    assert j.legs and j.legs[0].from_area.name == "Dundee (City Centre)"


def test_latest_departure_arrives_in_time():
    by = T.replace(hour=12)
    res = latest_departures(area_id("Edinburgh (City Centre)"), by)
    j = res[area_id("Perth (City Centre)")]
    assert j.arrival <= by


@pytest.mark.skip(reason="enable once real CSA lands (stub only fakes direct buses)")
def test_oban_to_dundee_needs_a_change():
    res = earliest_arrivals(area_id("Oban Bus Station"), T)
    assert res[area_id("Dundee (City Centre)")].changes >= 1
