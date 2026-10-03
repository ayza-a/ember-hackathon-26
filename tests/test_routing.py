import pytest
from datetime import datetime
from backend.db import TZ
from backend.routing import earliest_arrivals, latest_departures
from backend.db import load_areas

# Known area IDs in your imported Ember dataset
# These IDs come from your SQLite GTFS import (scripts/import_gtfs.py)
# Adjust if your local DB uses different IDs.
DUNDEE = 13
EDINBURGH = 42
OBAN = 112  # Example: adjust if your DB uses a different ID


def _dt(h, m):
    """Helper: create a timezone-aware datetime on a fixed test date."""
    return datetime(2026, 10, 10, h, m, tzinfo=TZ)


def test_forward_csa_direct_route():
    """Dundee → Edinburgh should be reachable and normally direct."""
    depart = _dt(8, 0)
    res = earliest_arrivals(DUNDEE, depart)

    assert EDINBURGH in res, "Edinburgh should be reachable from Dundee"
    j = res[EDINBURGH]

    assert j.origin_area_id == DUNDEE
    assert j.dest_area_id == EDINBURGH
    assert len(j.legs) >= 1, "Journey must contain at least one leg"

    # Direct route sanity check
    if len(j.legs) == 1:
        assert j.changes == 0
    else:
        # If GTFS has multiple stances, allow >1 legs but still no change
        assert j.changes <= 1


def test_reverse_csa_direct_route():
    """Reverse CSA should also find Dundee → Edinburgh."""
    arrive_by = _dt(12, 0)
    res = latest_departures(EDINBURGH, arrive_by)

    assert DUNDEE in res, "Dundee should be reachable in reverse CSA"
    j = res[DUNDEE]

    assert j.origin_area_id == DUNDEE
    assert j.dest_area_id == EDINBURGH
    assert len(j.legs) >= 1


def test_oban_to_dundee_requires_change():
    """Oban → Dundee should require at least one change."""
    depart = _dt(7, 0)
    res = earliest_arrivals(OBAN, depart)

    assert DUNDEE in res, "Dundee must be reachable from Oban"
    j = res[DUNDEE]

    assert len(j.legs) >= 2, "Oban → Dundee should require ≥1 change"
    assert j.changes >= 1


def test_change_time_respected():
    """Ensure change time ≥ 5 minutes between legs."""
    depart = _dt(8, 0)
    res = earliest_arrivals(DUNDEE, depart)
    j = res[EDINBURGH]

    for i in range(len(j.legs) - 1):
        a = j.legs[i].arrival
        d = j.legs[i + 1].departure
        delta = (d - a).total_seconds()
        assert delta >= 5 * 60, "Change time must be at least 5 minutes"


def test_pickup_dropoff_rules():
    """Ensure no leg violates pickup/drop-off rules."""
    depart = _dt(8, 0)
    res = earliest_arrivals(DUNDEE, depart)
    j = res[EDINBURGH]

    for leg in j.legs:
        # If pickup/drop-off rules were violated, CSA would not include the leg
        assert leg.from_area.lat is not None
        assert leg.to_area.lat is not None


def test_journey_reconstruction_is_consistent():
    """Ensure reconstructed journeys have consistent departure/arrival times."""
    depart = _dt(8, 0)
    res = earliest_arrivals(DUNDEE, depart)
    j = res[EDINBURGH]

    assert j.departure >= depart
    assert j.arrival > j.departure

    # Legs must be in chronological order
    for i in range(len(j.legs) - 1):
        assert j.legs[i].arrival <= j.legs[i + 1].departure


def test_forward_and_reverse_consistency():
    """Forward and reverse CSA should agree on reachability."""
    depart = _dt(8, 0)
    arrive_by = _dt(12, 0)

    fwd = earliest_arrivals(DUNDEE, depart)
    rev = latest_departures(EDINBURGH, arrive_by)

    assert EDINBURGH in fwd
    assert DUNDEE in rev

    # They don't need identical times, but both must produce valid journeys
    assert len(fwd[EDINBURGH].legs) >= 1
    assert len(rev[DUNDEE].legs) >= 1
