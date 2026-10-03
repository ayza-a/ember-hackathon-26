"""Planner tests with hand-built journeys (no DB, no routing). OWNER: workstream 2. Run: pytest tests/"""
from datetime import datetime

from backend.db import TZ
from backend.models import Area, Friend, Journey, Leg
from backend.planner import (MEET_MIN_SOCIAL_MIN, SHARED_BUS_BONUS, SHARED_CHANGE_BONUS, find_meet_events,
                             social_bonus)

INV = Area(id=1, name="Inverness")
AVI = Area(id=2, name="Aviemore")
GLA = Area(id=3, name="Glasgow")
THU = Area(id=4, name="Thurso")
ELG = Area(id=5, name="Elgin")
PER = Area(id=6, name="Perth")
DUN = Area(id=7, name="Dundee")


def t(hhmm: str) -> datetime:
    h, m = map(int, hhmm.split(":"))
    return datetime(2026, 10, 10, h, m, tzinfo=TZ)


def leg(trip: str, a: Area, dep: str, b: Area, arr: str, route: str = "E8") -> Leg:
    return Leg(trip_id=trip, route_id=route, from_area=a, to_area=b, departure=t(dep), arrival=t(arr), dist_km=10)


def journey(*legs: Leg) -> Journey:
    return Journey(origin_area_id=legs[0].from_area.id, dest_area_id=legs[-1].to_area.id, departure=legs[0].departure,
                   arrival=legs[-1].arrival, legs=list(legs), changes=len(legs) - 1, total_km=10 * len(legs))


def friends(*names: str) -> list[Friend]:
    return [Friend(id=i + 1, name=n, origin=INV, colour="#000") for i, n in enumerate(names)]


ISLA, EWAN, MHAIRI = friends("Isla", "Ewan", "Mhairi")


def test_hop_on_same_bus_at_later_boarders_stop():
    js = {1: journey(leg("X", INV, "11:37", GLA, "15:20")), 2: journey(leg("X", AVI, "12:26", GLA, "15:20"))}
    [e] = find_meet_events([ISLA, EWAN], js)
    assert e.kind == "same_bus" and e.area == AVI and e.trip_id == "X"
    assert e.start == t("12:26") and e.end == t("15:20")
    assert e.friend_ids == [1, 2]
    assert e.description == "Ewan hops on Isla’s E8 at Aviemore"


def test_same_trip_without_overlap_is_not_a_meeting():
    js = {1: journey(leg("X", INV, "11:37", AVI, "12:20")), 2: journey(leg("X", AVI, "12:26", GLA, "15:20"))}
    assert find_meet_events([ISLA, EWAN], js) == []


def test_three_riders_board_together_then_hop_on():
    js = {
        1: journey(leg("X", INV, "11:37", GLA, "15:20")),
        2: journey(leg("X", INV, "11:37", GLA, "15:20")),
        3: journey(leg("X", AVI, "12:26", GLA, "15:20")),
    }
    together, hop = find_meet_events([ISLA, EWAN, MHAIRI], js)
    assert together.description == "Isla & Ewan catch the same E8 from Inverness"
    assert together.friend_ids == [1, 2]
    assert hop.description == "Mhairi hops on Isla & Ewan’s E8 at Aviemore"
    assert sorted(hop.friend_ids) == [1, 2, 3]
    assert social_bonus([together, hop]) == SHARED_BUS_BONUS * 3  # pairs: IE, IM, EM


def test_long_change_overlap_is_time_together():
    js = {
        1: journey(leg("A", THU, "06:14", INV, "09:50", "E6"), leg("X", INV, "11:37", GLA, "15:20")),
        2: journey(leg("B", ELG, "10:02", INV, "11:12", "E7"), leg("Y", INV, "11:50", GLA, "15:40")),
    }
    [e] = find_meet_events([ISLA, EWAN], js)
    assert e.kind == "same_change" and e.area == INV
    assert (e.start, e.end) == (t("11:12"), t("11:37"))
    assert e.description == "Isla & Ewan both change at Inverness: 25 min together"
    assert social_bonus([e]) == SHARED_CHANGE_BONUS


def test_brief_overlap_is_shown_but_not_scored():
    js = {
        1: journey(leg("A", THU, "06:14", PER, "11:00"), leg("X", PER, "11:05", GLA, "13:00")),
        2: journey(leg("B", DUN, "10:00", PER, "11:02"), leg("Y", PER, "11:20", GLA, "13:10")),
    }
    [e] = find_meet_events([ISLA, EWAN], js)
    assert e.kind == "same_change"
    assert e.description == "Isla & Ewan cross paths at Perth for 3 min, say hi!"
    assert (e.end - e.start).total_seconds() / 60 < MEET_MIN_SOCIAL_MIN
    assert social_bonus([e]) == 0


def test_changes_at_different_times_do_not_meet():
    js = {
        1: journey(leg("A", THU, "06:14", PER, "09:00"), leg("X", PER, "09:10", GLA, "11:00")),
        2: journey(leg("B", DUN, "10:00", PER, "10:30"), leg("Y", PER, "10:40", GLA, "12:00")),
    }
    assert find_meet_events([ISLA, EWAN], js) == []


def test_arriving_at_destination_together_is_not_an_event():
    js = {1: journey(leg("A", PER, "10:00", GLA, "12:00")), 2: journey(leg("B", DUN, "09:30", GLA, "12:00"))}
    assert find_meet_events([ISLA, EWAN], js) == []


def test_three_friends_changing_together_merge_into_one_event():
    js = {
        1: journey(leg("A", THU, "06:00", INV, "11:00"), leg("X", INV, "11:40", GLA, "15:00")),
        2: journey(leg("B", ELG, "10:00", INV, "11:10"), leg("Y", INV, "11:45", GLA, "15:10")),
        3: journey(leg("C", AVI, "10:30", INV, "11:15"), leg("Z", INV, "11:50", GLA, "15:20")),
    }
    [e] = find_meet_events([ISLA, EWAN, MHAIRI], js)
    assert sorted(e.friend_ids) == [1, 2, 3]
    assert (e.start, e.end) == (t("11:15"), t("11:40"))
    assert e.description.startswith("Isla, Ewan & Mhairi all change at Inverness: 25 min together")
    assert social_bonus([e]) == SHARED_CHANGE_BONUS * 3


def test_missing_journeys_are_ignored():
    js = {1: journey(leg("X", INV, "11:37", GLA, "15:20")), 2: None}
    assert find_meet_events([ISLA, EWAN], js) == []
