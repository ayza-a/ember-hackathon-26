"""Group planning: mode 1 (synchronised arrival), mode 2 (where to meet), meet events.
OWNER: workstream 2 (Planner & API).

How it works (scoring, constants, rules): see "How it works" in README.md.
Implemented: meet-event detection. STUB (next steps): mode 1 anchor sweep, mode 2 ranking.
"""
from datetime import datetime, time
from itertools import combinations

from backend import places, routing
from backend.db import TZ, load_areas
from backend.models import Area, Friend, FriendPlan, Journey, MeetEvent, Meetup, MeetupSuggestion, Plan

# ---------------------------------------------------------------- tunables (documented in README)
MEET_MIN_SOCIAL_MIN = 10      # a same-change overlap at least this long counts as real time together
SHARED_BUS_BONUS = 15         # score bonus per pair of friends riding the same bus
SHARED_CHANGE_BONUS = 10      # score bonus per pair spending >= MEET_MIN_SOCIAL_MIN together while changing

CANDIDATE_HUBS = [
    "Edinburgh (City Centre)", "Glasgow Bus Station", "Perth (City Centre)", "Stirling (Erskine House)",
    "Dundee (City Centre)", "Inverness (City Centre)", "Aberdeen (City Centre)", "Pitlochry", "Aviemore Railway Station",
]


def plan_arrive(meetup: Meetup) -> Plan:
    """Mode 1: everyone arrives at meetup.destination close to (and not after) meetup.target_time."""
    assert meetup.destination and meetup.target_time
    journeys = routing.latest_departures(meetup.destination.id, meetup.target_time)
    friend_plans = [
        FriendPlan(friend_id=f.id, journey=journeys.get(f.origin.id),
                   note=None if f.origin.id in journeys else "No route found")
        for f in meetup.friends
    ]
    arrivals = [fp.journey.arrival for fp in friend_plans if fp.journey]
    events = find_meet_events(meetup.friends, {fp.friend_id: fp.journey for fp in friend_plans})
    prices = [fp.journey.price_gbp for fp in friend_plans if fp.journey and fp.journey.price_gbp]
    return Plan(
        meetup_slug=meetup.slug, destination=meetup.destination, target_time=meetup.target_time,
        first_arrival=min(arrivals, default=None), last_arrival=max(arrivals, default=None),
        spread_min=int((max(arrivals) - min(arrivals)).total_seconds() // 60) if arrivals else None,
        friends=friend_plans, meet_events=events, total_price_gbp=round(sum(prices), 2) if prices else None,
    )


def suggest(meetup: Meetup, top_n: int = 3) -> list[MeetupSuggestion]:
    """Mode 2: rank meeting areas by total travel time + fairness + distance."""
    if not meetup.friends:
        return []
    areas = load_areas()
    candidates = [a for a in areas.values() if a.name in CANDIDATE_HUBS]  # STUB: real version scores every area
    per_friend = {
        f.id: routing.earliest_arrivals(f.origin.id, f.earliest_departure or _default_start(meetup))
        for f in meetup.friends
    }
    out = []
    for area in candidates:
        plans = []
        for f in meetup.friends:
            j = per_friend[f.id].get(area.id)
            if f.origin.id == area.id:
                plans.append(FriendPlan(friend_id=f.id, journey=None, note="Already here"))
            elif j is None:
                break
            else:
                plans.append(FriendPlan(friend_id=f.id, journey=j))
        else:
            js = [p.journey for p in plans if p.journey]
            if not js:
                continue
            total = sum((j.arrival - j.departure).total_seconds() / 60 for j in js)
            km = sum(j.total_km for j in js)
            spread = (max(j.arrival for j in js) - min(j.arrival for j in js)).total_seconds() / 60
            out.append(MeetupSuggestion(
                area=area, meet_time=max(j.arrival for j in js), total_travel_min=int(total), total_km=round(km, 1),
                spread_min=int(spread), score=round(total + 0.5 * spread + 0.5 * km, 1), journeys=plans,
                places_summary=places.summary([area.id]).get(area.id, {}),
            ))
    return sorted(out, key=lambda s: s.score)[:top_n]


def _default_start(meetup: Meetup) -> datetime:
    return datetime.combine(meetup.date, time(8, 0), tzinfo=TZ)


# ---------------------------------------------------------------- meet events

def find_meet_events(friends: list[Friend], journeys: dict[int, Journey | None]) -> list[MeetEvent]:
    """Every point where friends' planned journeys bring them together, sorted by time.

    same_bus:    friends on the same trip at the same time. One event each time someone boards while
                 others are already aboard (or boards with them).
    same_change: friends waiting at the same station at overlapping times while changing buses.
                 Any overlap is shown; only >= MEET_MIN_SOCIAL_MIN minutes counts towards the score.
    Arriving together at the final destination is the point of the plan, so it isn't an event.
    """
    names = {f.id: f.name for f in friends}
    events = _same_bus_events(names, journeys) + _same_change_events(names, journeys)
    return sorted(events, key=lambda e: (e.start, e.kind))


def social_bonus(events: list[MeetEvent]) -> float:
    """Score reduction for time spent together (bigger = more social), counted per pair of friends.

    Shared buses: each distinct pair on the same trip counts once (a hop-on event lists everyone aboard).
    Changes: each pair in a same_change group of >= MEET_MIN_SOCIAL_MIN minutes counts.
    """
    bus_pairs = {(e.trip_id, a, b) for e in events if e.kind == "same_bus"
                 for a, b in combinations(sorted(e.friend_ids), 2)}
    change_pairs = sum(len(e.friend_ids) * (len(e.friend_ids) - 1) // 2
                       for e in events if e.kind == "same_change" and _minutes(e) >= MEET_MIN_SOCIAL_MIN)
    return SHARED_BUS_BONUS * len(bus_pairs) + SHARED_CHANGE_BONUS * change_pairs


def _same_bus_events(names: dict[int, str], journeys: dict[int, Journey | None]) -> list[MeetEvent]:
    riders_by_trip: dict[str, list] = {}
    for fid, j in journeys.items():
        for leg in (j.legs if j else []):
            riders_by_trip.setdefault(leg.trip_id, []).append((leg.departure, fid, leg))
    events = []
    for trip_id, riders in riders_by_trip.items():
        if len({fid for _, fid, _ in riders}) < 2:
            continue
        riders.sort(key=lambda r: (r[0], r[1]))
        aboard: list = []
        i = 0
        while i < len(riders):
            # everyone boarding at the same moment (same stop) is handled as one group
            group = [r for r in riders[i:] if r[0] == riders[i][0]]
            i += len(group)
            dep, leg = group[0][0], group[0][2]
            already = [r for r in aboard if r[2].arrival > dep]
            if already or len(group) > 1:
                ids = [r[1] for r in already] + [r[1] for r in group]
                end = min(r[2].arrival for r in already + group)
                if already:
                    desc = f"{_join(names, [r[1] for r in group])} hop{'s' if len(group) == 1 else ''} on "                            f"{_join(names, [r[1] for r in already])}’s {leg.route_id} at {leg.from_area.name}"
                else:
                    desc = f"{_join(names, ids)} catch the same {leg.route_id} from {leg.from_area.name}"
                events.append(MeetEvent(kind="same_bus", area=leg.from_area, start=dep, end=end, friend_ids=ids,
                                        trip_id=trip_id, description=desc))
            aboard += group
    return events


def _same_change_events(names: dict[int, str], journeys: dict[int, Journey | None]) -> list[MeetEvent]:
    # waits: (friend_id, area, from, to) between consecutive legs
    waits = [(fid, a.to_area, a.arrival, b.departure)
             for fid, j in journeys.items() if j
             for a, b in zip(j.legs, j.legs[1:])]
    groups: list[tuple[Area, datetime, datetime, list[int]]] = []
    for i, (f1, area1, s1, e1) in enumerate(waits):
        for f2, area2, s2, e2 in waits[i + 1:]:
            if f1 == f2 or area1.id != area2.id:
                continue
            start, end = max(s1, s2), min(e1, e2)
            if start > end:
                continue
            for k, (ga, gs, ge, gids) in enumerate(groups):  # merge into an overlapping group at the same station
                if ga.id == area1.id and max(gs, start) <= min(ge, end):
                    groups[k] = (ga, max(gs, start), min(ge, end), gids + [f for f in (f1, f2) if f not in gids])
                    break
            else:
                groups.append((area1, start, end, [f1, f2]))
    events = []
    for area, start, end, ids in groups:
        mins = int((end - start).total_seconds() // 60)
        who = _join(names, ids)
        if mins >= MEET_MIN_SOCIAL_MIN:
            desc = f"{who} all change at {area.name}: {mins} min together" if len(ids) > 2                 else f"{who} both change at {area.name}: {mins} min together"
        else:
            desc = f"{who} cross paths at {area.name}" + (f" for {mins} min" if mins else "") + ", say hi!"
        events.append(MeetEvent(kind="same_change", area=area, start=start, end=end, friend_ids=ids, description=desc))
    return events


def _join(names: dict[int, str], ids: list[int]) -> str:
    ns = [names.get(i, "?") for i in ids]
    return ns[0] if len(ns) == 1 else ", ".join(ns[:-1]) + " & " + ns[-1]


def _minutes(e: MeetEvent) -> int:
    return int((e.end - e.start).total_seconds() // 60)
