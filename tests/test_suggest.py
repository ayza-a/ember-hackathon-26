"""Mode 2 (suggest) tests with fake routing, stations and places. OWNER: workstream 2. Run: pytest tests/"""
from datetime import date

import pytest

from backend import planner
from backend.models import Area, Friend, Meetup
from tests.test_planner import journey, leg, t

# origins and candidate stations, spread out so they're far apart unless noted
O1 = Area(id=1, name="Origin One", region_name="One", lat=57.0, lon=-4.0)
O2 = Area(id=2, name="Origin Two", region_name="Two", lat=55.0, lon=-2.0)
Q = Area(id=10, name="Quickville", region_name="Quickville", lat=56.0, lon=-3.0)
Q2 = Area(id=11, name="Quickville Park", region_name="Quickville Park", lat=56.005, lon=-3.0)  # ~0.5 km from Q
F = Area(id=12, name="Fairford", region_name="Fairford", lat=56.3, lon=-3.5)
M = Area(id=13, name="Muchtodo", region_name="Muchtodo", lat=56.6, lon=-3.2)
X = Area(id=14, name="Faraway", region_name="Faraway", lat=55.6, lon=-3.8)
N = Area(id=15, name="Nothinghere", region_name="Nothinghere", lat=56.2, lon=-2.6)
U = Area(id=16, name="Unreachable", region_name="Unreachable", lat=56.9, lon=-3.0)
AREAS = {a.id: a for a in (O1, O2, Q, Q2, F, M, X, N, U)}

# minutes of travel (friend 1, friend 2) to each candidate; None = no route that day
TRAVEL = {Q.id: (30, 90), Q2.id: (40, 85), F.id: (65, 65), M.id: (70, 80), X.id: (100, 100), N.id: (10, 10), U.id: (20, None)}
WORTHY = {Q.id: 3, Q2.id: 99, F.id: 2, M.id: 20, X.id: 50, U.id: 5}  # N has nothing to meet at


def at_min(m: int) -> str:
    return f"{8 + m // 60:02d}:{m % 60:02d}"


@pytest.fixture
def fake(monkeypatch):
    def earliest_arrivals(origin, depart_after):
        idx = 0 if origin == O1.id else 1
        return {a.id: journey(leg(f"t{origin}-{a.id}", AREAS[origin], "08:00", a, at_min(mins[idx])))
                for a, mins in ((AREAS[k], v) for k, v in TRAVEL.items()) if mins[idx] is not None}
    monkeypatch.setattr(planner.routing, "earliest_arrivals", earliest_arrivals)
    monkeypatch.setattr(planner, "load_areas", lambda: AREAS)
    monkeypatch.setattr(planner, "_meet_worthy_areas", lambda: WORTHY)
    monkeypatch.setattr(planner.places, "summary", lambda ids: {i: {"cafe": WORTHY.get(i, 0)} for i in ids})


def meetup(*origins: Area) -> Meetup:
    fs = [Friend(id=i + 1, name=f"F{i + 1}", origin=o, colour="#000", earliest_departure=t("08:00"))
          for i, o in enumerate(origins)]
    return Meetup(slug="s", mode="suggest", date=date(2026, 10, 10), friends=fs, created_at=t("07:00"))


def test_three_labelled_options(fake):
    out = planner.suggest(meetup(O1, O2))
    assert [(s.label, s.area.name) for s in out] == [
        ("Quickest", "Quickville"),   # total 120
        ("Fairest", "Fairford"),      # longest journey 65
        ("Most to do", "Muchtodo"),   # Quickville Park has more, but it's 0.5 km from Quickville
    ]
    q = out[0]
    assert q.total_travel_min == 120 and q.spread_min == 60 and q.meet_time == t("09:30")
    assert q.places_summary == {"cafe": 3}


def test_most_to_do_stays_within_travel_budget(fake):
    # Faraway has 50 places but 200 min total > 1.5 x 120
    assert "Faraway" not in {s.area.name for s in planner.suggest(meetup(O1, O2))}


def test_stations_without_places_or_unreachable_are_never_suggested(fake):
    names = {s.area.name for s in planner.suggest(meetup(O1, O2))}
    assert "Nothinghere" not in names  # quickest by far, but nowhere to meet
    assert "Unreachable" not in names


def test_friend_already_at_a_candidate(fake):
    out = planner.suggest(meetup(O1, Q))  # friend 2 lives in Quickville
    quick = next(s for s in out if s.area == Q)
    notes = {p.friend_id: p.note for p in quick.journeys}
    assert notes[2] == "Already here"
    assert quick.total_travel_min == 30


def test_needs_two_friends(fake):
    assert planner.suggest(meetup(O1)) == []


def test_without_places_data_every_station_is_a_candidate(fake, monkeypatch):
    monkeypatch.setattr(planner, "_meet_worthy_areas", lambda: {})
    out = planner.suggest(meetup(O1, O2))
    assert out[0].label == "Quickest" and out[0].area == N
