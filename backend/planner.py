from datetime import datetime, timedelta
from backend.routing import earliest_arrivals, latest_departures
from backend.db import load_areas
from backend.models import (
    FriendPlan,
    MeetEvent,
    MeetupSuggestion,
    Plan,
)

MIN_MEET_WINDOW = timedelta(minutes=3)


def _overlap(a1, a2, b1, b2):
    """Return True if time windows overlap."""
    return max(a1, b1) <= min(a2, b2)


def _detect_same_bus(j1, j2):
    """Detect meet events where two friends ride the same bus."""
    events = []
    for l1 in j1.legs:
        for l2 in j2.legs:
            if l1.trip_id != l2.trip_id:
                continue

            # Overlapping segment?
            if _overlap(l1.departure, l1.arrival, l2.departure, l2.arrival):
                meet_time = max(l1.departure, l2.departure)
                events.append(
                    MeetEvent(
                        type="same_bus",
                        area_id=l1.from_area.id,
                        time=meet_time,
                        friends=[j1.origin_area_id, j2.origin_area_id],
                    )
                )
    return events


def _detect_same_change(j1, j2):
    """Detect meet events where two friends change buses at the same area."""
    events = []
    for i in range(len(j1.legs) - 1):
        a = j1.legs[i].to_area
        a_arr = j1.legs[i].arrival
        a_dep = j1.legs[i + 1].departure

        for k in range(len(j2.legs) - 1):
            b = j2.legs[k].to_area
            b_arr = j2.legs[k].arrival
            b_dep = j2.legs[k + 1].departure

            if a.id != b.id:
                continue

            if _overlap(a_arr, a_dep, b_arr, b_dep):
                meet_time = max(a_arr, b_arr)
                events.append(
                    MeetEvent(
                        type="same_change",
                        area_id=a.id,
                        time=meet_time,
                        friends=[j1.origin_area_id, j2.origin_area_id],
                    )
                )
    return events


def _score_plan(journey):
    """Simple hackathon scoring: earlier arrival is better."""
    return journey.arrival.timestamp()


def plan_arrive(friends, dest_area, arrive_by):
    """
    Mode 1: Everyone arrives by a fixed time.
    """
    areas = load_areas()
    friend_plans = []

    # Compute latest departures for each friend
    for f in friends:
        res = latest_departures(dest_area, arrive_by)
        if f.area_id not in res:
            continue
        j = res[f.area_id]
        friend_plans.append(FriendPlan(friend_id=f.id, journey=j))

    # Detect meet events
    events = []
    for i in range(len(friend_plans)):
        for k in range(i + 1, len(friend_plans)):
            j1 = friend_plans[i].journey
            j2 = friend_plans[k].journey
            events.extend(_detect_same_bus(j1, j2))
            events.extend(_detect_same_change(j1, j2))

    # Score suggestion
    score = sum(_score_plan(fp.journey) for fp in friend_plans)

    return Plan(
        friends=friend_plans,
        meet_events=events,
        suggestion=MeetupSuggestion(
            dest_area_id=dest_area,
            arrive_by=arrive_by,
            score=score,
        ),
    )


def plan_depart(friends, origin_area, depart_after):
    """
    Mode 2: Everyone departs after a fixed time.
    """
    areas = load_areas()
    friend_plans = []

    # Compute earliest arrivals for each friend
    for f in friends:
        res = earliest_arrivals(origin_area, depart_after)
        if f.area_id not in res:
            continue
        j = res[f.area_id]
        friend_plans.append(FriendPlan(friend_id=f.id, journey=j))

    # Detect meet events
    events = []
    for i in range(len(friend_plans)):
        for k in range(i + 1, len(friend_plans)):
            j1 = friend_plans[i].journey
            j2 = friend_plans[k].journey
            events.extend(_detect_same_bus(j1, j2))
            events.extend(_detect_same_change(j1, j2))

    score = sum(_score_plan(fp.journey) for fp in friend_plans)

    return Plan(
        friends=friend_plans,
        meet_events=events,
        suggestion=MeetupSuggestion(
            dest_area_id=origin_area,
            arrive_by=None,
            score=score,
        ),
    )
