"""Mode 1 (plan_arrive) tests with a fake routing engine. OWNER: workstream 2. Run: pytest tests/"""
from datetime import date

import pytest

from backend import planner
from backend.models import Area, Friend, Meetup
from tests.test_planner import GLA, INV, PER, journey, leg, t

DUN = Area(id=7, name="Dundee")
OBA = Area(id=8, name="Oban")
SKY = Area(id=9, name="Portree")
V = Area(id=10, name="Leuchars")
A = Area(id=11, name="Anstruther")


def fake_routing(monkeypatch, timetable: dict[int, list]):
    """timetable: origin area id -> possible journeys. latest_departures returns, per origin,
    the latest-departing journey that arrives by the given time."""
    def latest_departures(dest_area, arrive_by):
        out = {}
        for origin, js in timetable.items():
            ok = [j for j in js if j.arrival <= arrive_by]
            if ok:
                out[origin] = max(ok, key=lambda j: j.departure)
        return out
    monkeypatch.setattr(planner.routing, "latest_departures", latest_departures)


def meetup(*friends: tuple[str, Area], dest: Area = GLA, target: str = "16:00") -> Meetup:
    fs = [Friend(id=i + 1, name=n, origin=o, colour="#000") for i, (n, o) in enumerate(friends)]
    return Meetup(slug="test", mode="arrive", date=date(2026, 10, 10), destination=dest, target_time=t(target),
                  friends=fs, created_at=t("08:00"))


def test_picks_the_tightest_arrival_and_nobody_is_late(monkeypatch):
    fake_routing(monkeypatch, {
        DUN.id: [journey(leg("d1", DUN, "12:00", GLA, "14:00")), journey(leg("d2", DUN, "13:30", GLA, "15:30"))],
        PER.id: [journey(leg("p1", PER, "13:00", GLA, "14:20")), journey(leg("p2", PER, "14:10", GLA, "15:40")),
                 journey(leg("p3", PER, "14:50", GLA, "16:10"))],
    })
    plan = planner.plan_arrive(meetup(("Ben", DUN), ("Cal", PER)))
    js = {fp.friend_id: fp.journey for fp in plan.friends}
    assert js[1].legs[0].trip_id == "d2" and js[2].legs[0].trip_id == "p2"
    assert plan.spread_min == 10
    assert plan.last_arrival <= t("16:00")  # p3 would be late, so it is never chosen


def test_social_bonus_puts_friends_on_the_same_bus(monkeypatch):
    shared = "e8"
    fake_routing(monkeypatch, {
        # Isla could arrive 15:50 on her own, or 15:20 on the bus Ewan takes
        INV.id: [journey(leg(shared, INV, "11:37", GLA, "15:20")), journey(leg("solo", INV, "12:10", GLA, "15:50"))],
        PER.id: [journey(leg(shared, PER, "13:40", GLA, "15:20"))],
    })
    plan = planner.plan_arrive(meetup(("Isla", INV), ("Ewan", PER)))
    assert {fp.journey.legs[0].trip_id for fp in plan.friends} == {shared}
    assert plan.meet_events[0].kind == "same_bus"


def test_join_up_waits_at_a_change_for_a_friends_bus():
    # Anna changes at Leuchars and would take the 10:05; Ben's bus leaves Leuchars at 10:10 -> Anna waits for it
    anna = journey(leg("a1", A, "09:00", V, "10:00"), leg("a2", V, "10:05", DUN, "10:40"))
    ben = journey(leg("b1", V, "10:10", DUN, "10:45"))
    friends = [Friend(id=1, name="Anna", origin=A, colour="#000"), Friend(id=2, name="Ben", origin=V, colour="#000")]
    combo = planner._join_up(friends, {1: anna, 2: ben}, t("11:00"))
    assert [lg.trip_id for lg in combo[1].legs] == ["a1", "b1"]
    events = planner.find_meet_events(friends, combo)
    assert any(e.kind == "same_bus" and e.area == V for e in events)


def test_join_up_ignores_waits_that_are_too_long():
    anna = journey(leg("a1", A, "09:00", V, "10:00"), leg("a2", V, "10:05", DUN, "10:40"))
    ben = journey(leg("b1", V, "11:00", DUN, "11:35"))  # 60 min wait > MAX_JOIN_WAIT_MIN
    friends = [Friend(id=1, name="Anna", origin=A, colour="#000"), Friend(id=2, name="Ben", origin=V, colour="#000")]
    combo = planner._join_up(friends, {1: anna, 2: ben}, t("12:00"))
    assert [lg.trip_id for lg in combo[1].legs] == ["a1", "a2"]


def test_join_up_never_doubles_back():
    # Finn reaches Dundee (the destination), rides on to Leuchars, and could catch Kirsty's bus back to
    # Dundee to share it: nobody would travel like that, so no join-up
    finn = journey(leg("f1", A, "11:00", DUN, "11:30"), leg("f2", DUN, "11:40", V, "11:50"))
    kirsty = journey(leg("k1", V, "12:00", DUN, "12:10"))
    assert planner._join_options(finn, kirsty) == []


def test_routes_that_double_back_are_ignored(monkeypatch):
    # routing offers Ben a detour past Glasgow and back for the latest anchor; the direct bus must win
    detour = journey(leg("d1", DUN, "13:00", GLA, "14:00"), leg("d2", GLA, "14:10", PER, "14:40"),
                     leg("d3", PER, "15:00", GLA, "15:50"))
    direct = journey(leg("d1", DUN, "13:00", GLA, "14:00"))

    def latest_departures(dest_area, arrive_by):
        return {DUN.id: detour if arrive_by >= t("15:50") else direct}
    monkeypatch.setattr(planner.routing, "latest_departures", latest_departures)
    plan = planner.plan_arrive(meetup(("Ben", DUN)))
    assert [lg.trip_id for lg in plan.friends[0].journey.legs] == ["d1"]


def test_auto_widens_when_nothing_arrives_in_the_window(monkeypatch):
    fake_routing(monkeypatch, {
        OBA.id: [journey(leg("o1", OBA, "10:38", GLA, "13:26"))],  # 2h34 before the target
        DUN.id: [journey(leg("d1", DUN, "13:49", GLA, "15:51"))],
    })
    plan = planner.plan_arrive(meetup(("Cal", OBA), ("Ben", DUN)))
    cal = plan.friends[0]
    assert cal.journey is not None
    assert "No bus arrives within 2h of 16:00" in cal.note
    assert "before the last friend" in cal.note  # also a long wait


def test_already_there_and_no_route_notes(monkeypatch):
    fake_routing(monkeypatch, {DUN.id: [journey(leg("d1", DUN, "13:49", GLA, "15:51"))]})
    plan = planner.plan_arrive(meetup(("Finn", GLA), ("Morag", SKY), ("Ben", DUN)))
    notes = {fp.friend_id: fp.note for fp in plan.friends}
    assert notes[1] == "Already there"
    assert notes[2].startswith("No Ember bus from Portree arrives at Glasgow in the 4h before 16:00")
    assert plan.friends[1].journey is None and plan.friends[2].journey is not None


def test_manual_window_is_respected(monkeypatch):
    fake_routing(monkeypatch, {OBA.id: [journey(leg("o1", OBA, "10:38", GLA, "13:26"))]})
    plan = planner.plan_arrive(meetup(("Cal", OBA)), window_min=240)
    assert plan.friends[0].journey is not None
    assert plan.friends[0].note is None  # found within the requested window, so not "widened"


@pytest.mark.parametrize("mins,expected", [(25, "25 min"), (60, "1h"), (100, "1h40")])
def test_duration_format(mins, expected):
    assert planner._fmt_dur(mins) == expected
