"""Group planning: mode 1 (synchronised arrival), mode 2 (where to meet), meet events.
OWNER: workstream 2 (Planner & API).

STUB: naive versions that produce well-formed output so the frontend can integrate.
Replace with the algorithms in docs/PLAN.md (spread scoring over T' candidates, meet-event detection).
"""
from datetime import datetime, time

from backend import places, routing
from backend.db import TZ, load_areas
from backend.models import FriendPlan, MeetEvent, Meetup, MeetupSuggestion, Plan

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
    events: list[MeetEvent] = []
    if len(meetup.friends) >= 2 and arrivals:  # STUB: one fake event so the UI has something to draw
        a, b = meetup.friends[0], meetup.friends[1]
        events.append(MeetEvent(kind="same_change", area=meetup.destination, start=min(arrivals), end=max(arrivals),
                                friend_ids=[a.id, b.id], description=f"(stub) {a.name} and {b.name} meet at {meetup.destination.name}"))
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
