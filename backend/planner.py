"""Group planning: mode 1 (synchronised arrival), mode 2 (where to meet), meet events.
OWNER: workstream 2 (Planner & API).

How it works (scoring, constants, rules): see "How it works" in README.md.
Implemented: mode 1 (anchor sweep, join-up, notes), mode 2 (labelled suggestions), meet events.
"""
import math
from datetime import datetime, time, timedelta
from functools import lru_cache
from itertools import combinations

from backend import fares, places, routing
from backend.db import TZ, get_conn, load_areas
from backend.models import Area, Friend, FriendPlan, Journey, Leg, MeetEvent, Meetup, MeetupSuggestion, Plan

# ---------------------------------------------------------------- tunables (documented in README)
MEET_MIN_SOCIAL_MIN = 10      # a same-change overlap at least this long counts as real time together
SHARED_BUS_BONUS = 15         # score bonus per pair of friends riding the same bus
SHARED_CHANGE_BONUS = 10      # score bonus per pair spending >= MEET_MIN_SOCIAL_MIN together while changing

WINDOW_MIN = 120              # mode 1: look for arrivals up to this long before the target time
WIDEN_WINDOW_MIN = 240        # ...automatically widened to this for friends with no option in WINDOW_MIN
STEP_MIN = 10                 # spacing of candidate arrival times (plan A grid)
LATE_ALLOWANCE_MIN = 0        # how late after the target anyone may arrive (0 = never late)
EARLY_WEIGHT = 0.25           # score per minute the last friend arrives before the target
CHANGE_WEIGHT = 20            # score per bus change, summed over the group
LEAVE_EARLY_WEIGHT = 0.5      # score per minute a friend leaves earlier than they'd need to (the cost of togetherness)
LATE_WEIGHT = 2               # score per minute the last friend arrives after the target
MISSING_PENALTY = 1000        # score per friend with no journey (so plans covering everyone always win)
LONG_WAIT_MIN = 60            # note a friend who arrives this much before the last friend
MAX_JOIN_WAIT_MIN = 45        # join-up: longest extra wait to catch a friend's bus
MIN_CHANGE_MIN = 5            # time needed to change buses at a station

MEET_CATEGORIES = {"cafe", "food", "shop", "viewpoint", "beach"}  # mode 2: what counts as somewhere to meet
MIN_MEET_PLACES = 3           # mode 2: a station needs at least this many of them nearby (a bit of choice)
MOST_TO_DO_MAX_TRAVEL = 1.5   # "Most to do" may cost at most this times the quickest option's total travel
DEFAULT_START = time(8, 0)    # mode 2: earliest departure for friends who didn't give one
MIN_SEPARATION_KM = 8         # mode 2: suggestions must be at least this far apart (different towns)


def plan_arrive(meetup: Meetup, window_min: int = WINDOW_MIN) -> Plan:
    """Mode 1: everyone arrives at meetup.destination close together, just before meetup.target_time.

    Anchor sweep: for each candidate arrival time T', each friend takes their latest journey arriving by T'.
    Each combination gets a join-up pass (wait for a friend's bus), then the lowest score wins.
    """
    assert meetup.destination and meetup.target_time
    dest, target = meetup.destination, meetup.target_time
    travellers = [f for f in meetup.friends if f.origin.id != dest.id]

    best: dict[int, Journey | None] = {}
    best_score = float("inf")
    widened: set[int] = set()
    if travellers:
        anchors = {t: routing.latest_departures(dest.id, t) for t in _candidate_times(target, window_min)}

        def options(f: Friend, mins: int) -> list[Journey]:
            """Each friend's usable journeys across all anchors: arriving inside the window ("arrive by T'"
            also returns buses landing hours earlier) and not doubling back (passing a station twice)."""
            seen, out = set(), []
            for r in anchors.values():
                j = r.get(f.origin.id)
                key = j and tuple((leg.trip_id, leg.from_area.id, leg.to_area.id) for leg in j.legs)
                if j and key not in seen and j.arrival >= target - timedelta(minutes=mins) and not _loops(j):
                    seen.add(key)
                    out.append(j)
            return out

        missing = [f for f in travellers if not options(f, window_min)]
        if missing and window_min < WIDEN_WINDOW_MIN:
            extra = [t for t in _candidate_times(target, WIDEN_WINDOW_MIN) if t not in anchors]
            anchors |= {t: routing.latest_departures(dest.id, t) for t in extra}
            widened = {f.id for f in missing if options(f, WIDEN_WINDOW_MIN)}
        pool = {f.id: options(f, WIDEN_WINDOW_MIN if f.id in widened else window_min) for f in travellers}
        # latest anyone could leave and still make it: what "leaving early" is measured against
        latest_dep = {fid: max((j.departure for j in js), default=None) for fid, js in pool.items()}
        for t in sorted(anchors, reverse=True):
            # each friend takes their latest-leaving usable journey arriving by T' (fewer changes, then earlier arrival on ties)
            raw = {fid: max((j for j in js if j.arrival <= t), default=None,
                            key=lambda j: (j.departure, -j.changes, -j.arrival.timestamp()))
                   for fid, js in pool.items()}
            combo = _join_up(meetup.friends, raw, target, latest_dep)
            score = _score(meetup.friends, combo, target, latest_dep)
            if score < best_score:
                best, best_score = combo, score

    arrivals = [j.arrival for j in best.values() if j]
    last = max(arrivals, default=None)
    friend_plans = [
        FriendPlan(friend_id=f.id, journey=best.get(f.id),
                   note=_note(f, best.get(f.id), dest, target, last, f.id in widened, window_min))
        for f in meetup.friends
    ]
    prices = [j.price_gbp for j in best.values() if j and j.price_gbp]
    return Plan(
        meetup_slug=meetup.slug, destination=dest, target_time=target,
        first_arrival=min(arrivals, default=None), last_arrival=last,
        spread_min=_mins(last - min(arrivals)) if arrivals else None,
        friends=friend_plans, meet_events=find_meet_events(meetup.friends, best),
        total_price_gbp=round(sum(prices), 2) if prices else None,
    )


def _candidate_times(target: datetime, window_min: int) -> list[datetime]:
    """Plan A: every STEP_MIN minutes from target + LATE_ALLOWANCE_MIN back to target - window_min.
    (Plan B: use the actual bus arrival times at the destination instead of a fixed grid.)"""
    latest = target + timedelta(minutes=LATE_ALLOWANCE_MIN)
    n = (window_min + LATE_ALLOWANCE_MIN) // STEP_MIN
    return [latest - timedelta(minutes=STEP_MIN * i) for i in range(n + 1)]


def _score(friends: list[Friend], combo: dict[int, Journey | None], target: datetime,
           latest_dep: dict[int, datetime | None] | None = None) -> float:
    """Lower is better. Formula and weights are documented in README "How it works"."""
    js = [j for j in combo.values() if j]
    if not js:
        return MISSING_PENALTY * len(combo)
    first, last = min(j.arrival for j in js), max(j.arrival for j in js)
    early = max(0, _mins(target - last))
    late = max(0, _mins(last - target))
    changes = sum(j.changes for j in js)
    leave_early = sum(max(0, _mins(latest_dep[fid] - j.departure))
                      for fid, j in combo.items() if j and latest_dep and latest_dep.get(fid))
    return (_mins(last - first) + EARLY_WEIGHT * early + CHANGE_WEIGHT * changes + LATE_WEIGHT * late
            + LEAVE_EARLY_WEIGHT * leave_early + MISSING_PENALTY * (len(combo) - len(js))
            - social_bonus(find_meet_events(friends, combo)))


def _note(f: Friend, j: Journey | None, dest: Area, target: datetime, last: datetime | None,
          widened: bool, window_min: int) -> str | None:
    if f.origin.id == dest.id:
        return "Already there"
    if j is None:
        hours = _fmt_dur(max(window_min, WIDEN_WINDOW_MIN))
        return (f"No Ember bus from {f.origin.name} arrives at {dest.name} in the {hours} before {target:%H:%M}: "
                "try a later time or widen the search")
    notes = []
    if widened:
        notes.append(f"No bus arrives within {_fmt_dur(window_min)} of {target:%H:%M}, so this is an earlier one")
    if last and _mins(last - j.arrival) >= LONG_WAIT_MIN:
        notes.append(f"Arrives {_fmt_dur(_mins(last - j.arrival))} before the last friend")
    return "; ".join(notes) or None


# ---------------------------------------------------------------- join-up: wait for a friend's bus

def _join_up(friends: list[Friend], combo: dict[int, Journey | None], target: datetime,
             latest_dep: dict[int, datetime | None] | None = None) -> dict[int, Journey | None]:
    """Greedily move friends onto each other's buses wherever that improves the score.

    If X is at station V (changing there, passing through on a bus that lets people off, or starting there)
    in time for Y's onward bus from V, try X = X's journey up to V + Y's journey from V.
    """
    combo = dict(combo)
    current = _score(friends, combo, target, latest_dep)
    for _ in range(3):  # each accepted move can unlock another
        improved = False
        for x in list(combo):
            for y in list(combo):
                jx, jy = combo[x], combo[y]
                if x == y or not jx or not jy:
                    continue
                for cand in _join_options(jx, jy):
                    trial = {**combo, x: cand}
                    s = _score(friends, trial, target, latest_dep)
                    if s < current:
                        combo, current, improved = trial, s, True
                        break
        if not improved:
            break
    return combo


def _join_options(jx: Journey, jy: Journey) -> list[Journey]:
    """Journeys where X follows their own route to a station V on Y's route, then rides with Y from V."""
    options = []
    x_trips = {leg.trip_id for leg in jx.legs}
    for k, ly in enumerate(jy.legs):
        if ly.trip_id in x_trips:
            continue  # already sharing this bus
        v = ly.from_area.id
        if jx.legs[0].from_area.id == v:
            # X starts at V: just take Y's bus from there (leaving a bit earlier or later)
            if abs(_mins(ly.departure - jx.departure)) <= MAX_JOIN_WAIT_MIN:
                options.append(_journey(list(jy.legs[k:])))
            continue
        for i, lx in enumerate(jx.legs):
            reach = _reach(lx, v)
            if reach is None:
                continue
            cut_leg, at_v = reach
            prefix, suffix = list(jx.legs[:i]) + [cut_leg], list(jy.legs[k:])
            if (MIN_CHANGE_MIN <= _mins(ly.departure - at_v) <= MAX_JOIN_WAIT_MIN
                    and not _doubles_back(prefix, suffix)):
                options.append(_journey(prefix + suffix))
            break
    return options


def _doubles_back(prefix: list[Leg], suffix: list[Leg]) -> bool:
    """True if X, on the way to the join point, already passes a station that Y's bus then heads to
    (e.g. riding past the destination to catch a friend's bus back). Nobody travels like that."""
    before = {a for leg in prefix for a in _leg_path(leg)} - {prefix[-1].to_area.id}
    after = {a for leg in suffix for a in _leg_path(leg)} - {suffix[0].from_area.id}
    return bool(before & after)


def _loops(j: Journey) -> bool:
    """True if a journey passes through the same station twice (e.g. riding past the destination and back)."""
    path = [a for leg in j.legs for a in _leg_path(leg)]
    visits = [a for i, a in enumerate(path) if i == 0 or a != path[i - 1]]  # merge stances/changes at one station
    return len(visits) != len(set(visits))


def _leg_path(leg: Leg) -> list[int]:
    """Stations a leg passes through in order, boarding and alighting included."""
    stops = _trip_stops(leg.trip_id)
    found = _locate(leg, stops) if stops else None
    if found is None:
        return [leg.from_area.id, leg.to_area.id]
    board, _base = found
    out = [leg.from_area.id]
    for seq, stop_area, *_ in stops:
        if seq <= board[0]:
            continue
        out.append(stop_area)
        if stop_area == leg.to_area.id:
            break
    return out


def _reach(leg: Leg, area_id: int) -> tuple[Leg, datetime] | None:
    """If `leg` can drop X at `area_id` (its end, or a stop on the way that allows drop-off),
    return the leg cut short there plus the arrival time."""
    if leg.to_area.id == area_id:
        return leg, leg.arrival
    stops = _trip_stops(leg.trip_id)
    found = _locate(leg, stops)
    if found is None:
        return None
    board, base = found
    for seq, stop_area, arr_s, _dep_s, dist_km, drop_ok, atco in stops:
        if seq <= board[0]:
            continue
        if stop_area == leg.to_area.id:
            return None  # reached the end of the leg without passing area_id
        if stop_area == area_id and drop_ok:
            arrival = base + timedelta(seconds=arr_s)
            cut = leg.model_copy(update=dict(
                to_area=load_areas()[area_id], arrival=arrival, dist_km=round(dist_km - board[4], 1),
                price_gbp=fares.leg_price(leg.route_id, board[6], atco)))
            return cut, arrival
    return None


def _locate(leg: Leg, stops: tuple) -> tuple[tuple, datetime] | None:
    """Find the stop row where `leg` boards, plus midnight of its service date. A station can appear on
    consecutive stops (several stances), so pick the row whose times match the leg's arrival."""
    boards = [s for s in stops if s[1] == leg.from_area.id]
    for b in boards:
        base = leg.departure - timedelta(seconds=b[3])
        if any(s[0] > b[0] and s[1] == leg.to_area.id and base + timedelta(seconds=s[2]) == leg.arrival for s in stops):
            return b, base
    return (boards[0], leg.departure - timedelta(seconds=boards[0][3])) if boards else None


@lru_cache(maxsize=4096)
def _trip_stops(trip_id: str) -> tuple:
    """(seq, area_id, arr_s, dep_s, dist_km, drop_off_allowed, atco) for each stop of a GTFS trip."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT st.seq, g.area_id, st.arr_s, st.dep_s, st.dist_km, st.drop_off_type != 1, st.stop_id "
            "FROM stop_times st JOIN gtfs_stops g ON g.stop_id = st.stop_id WHERE st.trip_id = ? ORDER BY st.seq",
            (trip_id,),
        ).fetchall()
    return tuple(tuple(r) for r in rows)


def _journey(legs: list[Leg]) -> Journey:
    prices = [leg.price_gbp for leg in legs]
    return Journey(origin_area_id=legs[0].from_area.id, dest_area_id=legs[-1].to_area.id,
                   departure=legs[0].departure, arrival=legs[-1].arrival, legs=legs, changes=len(legs) - 1,
                   total_km=round(sum(leg.dist_km for leg in legs), 1),
                   price_gbp=round(sum(prices), 2) if all(p is not None for p in prices) else None)


def _mins(d: timedelta) -> int:
    return int(d.total_seconds() // 60)


def _fmt_dur(mins: int) -> str:
    h, m = divmod(mins, 60)
    return f"{h}h{m:02d}" if h and m else f"{h}h" if h else f"{m} min"


# ---------------------------------------------------------------- mode 2: where should we meet?

def suggest(meetup: Meetup) -> list[MeetupSuggestion]:
    """Mode 2: up to three labelled meeting places, each in a different town.

    Each is at least MIN_SEPARATION_KM from the others.
    Quickest:   least total travel time for the group.
    Fairest:    the longest individual journey is as short as possible.
    Most to do: most meet-worthy places nearby, with total travel within MOST_TO_DO_MAX_TRAVEL x the quickest.
    A station is only a candidate with >= MIN_MEET_PLACES places to meet nearby (MEET_CATEGORIES in the places data).
    """
    if len(meetup.friends) < 2:
        return []
    start = datetime.combine(meetup.date, DEFAULT_START, tzinfo=TZ)
    reach = {f.id: routing.earliest_arrivals(f.origin.id, f.earliest_departure or start) for f in meetup.friends}
    worthy = _meet_worthy_areas()

    options = []
    for area in load_areas().values():
        if area.lat is None or (worthy and area.id not in worthy):
            continue
        if all(f.origin.id == area.id for f in meetup.friends):
            continue
        plans, minutes = [], []
        for f in meetup.friends:
            if f.origin.id == area.id:
                plans.append(FriendPlan(friend_id=f.id, note="Already here"))
                minutes.append(0)
                continue
            j = reach[f.id].get(area.id)
            if j is None:
                break  # someone can't get here that day
            plans.append(FriendPlan(friend_id=f.id, journey=j))
            minutes.append(_mins(j.arrival - j.departure))
        else:
            js = [p.journey for p in plans if p.journey]
            options.append(dict(
                area=area, plans=plans, total=sum(minutes), longest=max(minutes),
                km=sum(j.total_km for j in js), things=worthy.get(area.id, 0),
                meet_time=max(j.arrival for j in js),
                spread=_mins(max(j.arrival for j in js) - min(j.arrival for j in js)),
            ))
    if not options:
        return []

    quickest_total = min(o["total"] for o in options)
    pickers = [
        ("Quickest", options, lambda o: (o["total"], o["longest"], o["spread"])),
        ("Fairest", options, lambda o: (o["longest"], o["total"])),
        ("Most to do", [o for o in options if o["total"] <= MOST_TO_DO_MAX_TRAVEL * quickest_total],
         lambda o: (-o["things"], o["total"])),
    ]
    out, chosen = [], []
    for label, pool, key in pickers:
        pool = [o for o in pool if all(_km(o["area"], c) >= MIN_SEPARATION_KM for c in chosen)]
        if not pool:
            continue
        o = min(pool, key=key)
        chosen.append(o["area"])
        out.append(MeetupSuggestion(
            area=o["area"], meet_time=o["meet_time"], total_travel_min=o["total"], total_km=round(o["km"], 1),
            spread_min=o["spread"], score=round(o["total"] + 0.5 * o["spread"] + 0.2 * o["km"], 1),
            journeys=o["plans"], places_summary=places.summary([o["area"].id]).get(o["area"].id, {}), label=label,
        ))
    return out


@lru_cache(maxsize=1)
def _meet_worthy_areas() -> dict[int, int]:
    """{area_id: number of meet-worthy places nearby}. Empty if there's no places data yet
    (then every station is a candidate). Cached: restart the server after re-importing places."""
    counts = places.summary(list(load_areas()))
    return {a: n for a, cats in counts.items()
            if (n := sum(v for c, v in cats.items() if c in MEET_CATEGORIES)) >= MIN_MEET_PLACES}


def _km(a: Area, b: Area) -> float:
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b.lon - a.lon) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


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

    Each pair of friends counts once per kind, however many buses or changes they share, so the planner
    doesn't send people on detours just to stack up bonuses.
    Shared buses: every pair riding a bus together (a hop-on event lists everyone aboard).
    Changes: every pair in a same_change group of >= MEET_MIN_SOCIAL_MIN minutes.
    """
    def pairs(kind: str, min_minutes: int = 0) -> set:
        return {p for e in events if e.kind == kind and _minutes(e) >= min_minutes
                for p in combinations(sorted(e.friend_ids), 2)}
    return SHARED_BUS_BONUS * len(pairs("same_bus")) + SHARED_CHANGE_BONUS * len(pairs("same_change", MEET_MIN_SOCIAL_MIN))


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
    return _mins(e.end - e.start)
