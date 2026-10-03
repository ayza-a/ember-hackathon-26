# Ember Group Journeys

Friends travelling by [Ember](https://www.ember.to) bus from different towns get journeys that **arrive together** (changes included). The app shows where they can **share a bus or meet while changing**, suggests **where to meet**, and recommends **places to explore** on the way.

See [How it works](#how-it-works) below for the product rules, and [`docs/PLAN.md`](docs/PLAN.md) for team workstreams.

## Setup
Requires Python 3.11+ and Node 20+.

```bash
# 1. backend deps (Windows: use `py` instead of `python3`, and `.venv\Scripts\activate`)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. data: Ember stations + GTFS timetable (51 MB download) + places -> data/ember.db
python scripts/refresh_all.py

# 3. run the API -> http://localhost:8000/docs
uvicorn backend.main:app --reload --port 8000

# 4. run the frontend (new terminal) -> http://localhost:5173
cd frontend
npm install
npm run dev
```

To work on the frontend without the backend, run `VITE_USE_MOCKS=1 npm run dev`. The meetup, plan and suggestions then come from `frontend/src/mocks/`.

Tests: `pytest tests/`

## Layout
```
backend/   FastAPI app: routing.py (CSA over GTFS), planner.py, places.py, routers/
scripts/   data imports: Ember stops, GTFS, OpenStreetMap places, curated places
frontend/  Vite + React + TypeScript + Tailwind + MapLibre
data/      SQLite DB + GTFS zip (gitignored; rebuilt by scripts/refresh_all.py)
```

## How it works

Status key: ✅ implemented · 🚧 planned (being built now) · 💡 later idea

### The meetup
1. Someone creates a meetup and shares the link (`/m/{slug}`). There are no accounts: **having the link means you're invited**. ✅
2. Each friend opens the link and joins with their name and the station they're travelling from. ✅
3. The page refreshes every 5 s, so new friends and the updated plan appear for everyone without reloading. ✅

There are two kinds of meetup.

### Mode 1: "Meet at X by T"
The group already knows **where and when** (e.g. *Glasgow, 16:00 Saturday*). The app plans every friend's buses, changes included, so that:
- everyone arrives **close together, just before T**,
- friends **ride the same bus** wherever possible,
- every point where their journeys cross is shown.

**How the plan is chosen** ✅
1. **Candidate arrival times.** For every time T′ from T − 2 h to T in 10-minute steps, ask the routing engine for the latest-leaving journey from every station that arrives by T′. One call covers all friends.
   - Only journeys arriving **inside the window** (T − 2 h to T) count. A bus landing at 09:00 for a 16:00 meetup isn't an option.
   - This is "Plan A". The candidate generator (`_candidate_times`) is a single function, so a smarter sweep (only the real bus arrival times) can replace it later.
   - **No doubling back:** journeys that pass the same station twice (e.g. riding past the destination and back) are ignored, and that friend falls back to their next-best direct option. The join-up step below never creates one either.
2. **Anchor scoring.** For each T′, each friend takes their best journey arriving by T′. Score that combination (lower is better):

   ```
   score = spread + 0.25 × early + 20 × changes + 0.5 × leave_early + 2 × late − social_bonus
   ```

   | Term | Meaning |
   |---|---|
   | `spread` | Minutes between the first and last friend arriving |
   | `early` | Minutes the last friend arrives before T (stops everyone arriving at 10:00 for a 12:00 meetup) |
   | `changes` | Total bus changes across the group (changes are stressful) |
   | `leave_early` | Minutes each friend sets off earlier than they'd need to (vs the latest bus that still gets them there in the window), summed. **The cost of togetherness:** it stops the planner sending someone on a 3:52am, 3-change detour just to share a bus |
   | `late` | Minutes after T. **0 by default**: journeys are searched as "arrive by T", so nobody can be late. `LATE_ALLOWANCE_MIN` can permit a few minutes |
   | `social_bonus` | Rewards time together (below). **The app's point is socialising**, so it accepts a slightly worse plan to put friends on the same bus |

   The lowest-scoring T′ wins. With these weights, **one shared-bus pair (15) is worth leaving 30 min earlier**.
3. **Wait for your friend (join-up).** ✅ Suppose Anna reaches Leuchars and could catch a bus in 5 min, but Ben arrives in 7 min and catches the next one in 10. Then Anna waits and rides with Ben.
   - "Arrive by" routing already picks the *latest* onward bus that still makes it, which usually does this.
   - A join-up pass also catches the remaining cases: if a friend is at a station in time for another friend's onward bus, their journey is rewritten to ride together, as long as their extra wait is ≤ 45 min (`MAX_JOIN_WAIT_MIN`).
4. **No options in the window?** ✅ If a friend has no journey within 2 h, the window widens to 4 h for them automatically, and their card says so. The window can also be widened by hand: `GET /api/meetups/{slug}/plan?window_min=240`.
5. **Long waits are flagged.** ✅ If a friend would arrive more than 60 min before the last friend (e.g. the only bus that makes it), their card shows a note. 💡 Later: let the group react to it (change the time, pick another place).

### Meet events: where friends run into each other ✅
Every encounter is shown, even short ones. Delays can turn a 3-minute crossing into a coffee.

| Kind | When | Example |
|---|---|---|
| `same_bus` | Friends on the same bus at the same time, with one event each time someone boards | "Isla & Ewan catch the same E8 from Inverness", "Mhairi hops on Isla & Ewan's E8 at Aviemore" |
| `same_change`, ≥ 10 min | Friends waiting at the same station at overlapping times while changing buses | "Isla & Ewan both change at Inverness: 25 min together" |
| `same_change`, < 10 min | As above, but a short overlap | "Isla & Ewan cross paths at Perth for 3 min, say hi!" |

Arriving together at the final destination is the point of the plan, so it isn't an event.

**Social bonus** (it lowers the score):
- **15** for each pair of friends who share a bus.
- **10** for each pair with ≥ 10 min together while changing.
- Each pair counts **once per kind**, however many buses they share, so detours can't stack up bonuses.
- Short encounters are shown but don't score.

All constants live at the top of `backend/planner.py`:

| Constant | Value | Meaning |
|---|---|---|
| `WINDOW_MIN` / `WIDEN_WINDOW_MIN` | 120 / 240 | Arrival window, and the automatic widening |
| `STEP_MIN` | 10 | Candidate arrival-time spacing |
| `EARLY_WEIGHT` | 0.25 | Per minute the group arrives before T |
| `CHANGE_WEIGHT` | 20 | Per bus change |
| `LEAVE_EARLY_WEIGHT` | 0.5 | Per minute a friend leaves earlier than needed |
| `LATE_ALLOWANCE_MIN` / `LATE_WEIGHT` | 0 / 2 | Permitted lateness, and its cost per minute |
| `SHARED_BUS_BONUS` / `SHARED_CHANGE_BONUS` | 15 / 10 | Social bonus per pair |
| `MEET_MIN_SOCIAL_MIN` | 10 | Minimum time at a change to count as "time together" |
| `MAX_JOIN_WAIT_MIN` / `MIN_CHANGE_MIN` | 45 / 5 | Join-up: longest wait for a friend's bus, and time needed to change |
| `LONG_WAIT_MIN` | 60 | Flag friends arriving this long before the last one |

**Example, from the real timetable (Glasgow by 16:00, Saturday):**
- Isla (Thurso) and Ewan (Elgin) both change at Inverness and get 25 min together.
- They catch the same E8, and Mhairi hops on at Aviemore.
- Anna (Aberdeen) changes at Dundee onto Ben's E3.
- Everyone arrives between 15:20 and 15:51, for £76.15 in total.

### Mode 2: "Where should we meet?" ✅
The group knows **the day but not the place**. Each friend joins with their station and the **earliest time they can leave** (default 08:00).
1. For each friend, the routing engine works out the earliest arrival at **every station** from their start.
2. **Candidate stations** must have at least **3 places to meet** nearby (café, restaurant/food, local shop, viewpoint or beach) in the places database, and every friend must be able to get there that day.
   - Junctions, depots and lay-bys never qualify, and neither does a single roadside café.
   - The rule comes from the data, not a hard-coded list. About 150 of 451 stations qualify.
   - With no places data at all, every station is a candidate.
3. The app offers up to **three labelled options**, each at least **8 km** from the others (never three stops in the same city):
   - **Quickest:** least total travel time for the group.
   - **Fairest:** the longest individual journey is as short as possible.
   - **Most to do:** most places to meet nearby, while total travel stays within 1.5× of the quickest.
4. The meeting time is when the last friend can arrive. A friend who already lives there shows as "Already here".
5. **Pick this** turns the meetup into Mode 1 for that place and time. The planner then re-syncs everyone, so the friends who'd arrive early can leave later, and looks for shared buses.

| Constant | Value | Meaning |
|---|---|---|
| `MEET_CATEGORIES` | cafe, food, shop, viewpoint, beach | What counts as somewhere to meet |
| `MIN_MEET_PLACES` | 3 | How many a station needs nearby |
| `MOST_TO_DO_MAX_TRAVEL` | 1.5 | "Most to do" travel budget vs the quickest |
| `MIN_SEPARATION_KM` | 8 | Minimum distance between suggestions |
| `DEFAULT_START` | 08:00 | Earliest departure if a friend doesn't give one |

**Example, from the real timetable and places (Inverness, Glasgow, Aberdeen and Oban friends, Saturday):**
- **Quickest:** Bridge of Earn.
- **Fairest:** Edinburgh Corstorphine.
- **Most to do:** Glasgow, where Finn already lives.
- Picking Bridge of Earn re-syncs arrivals from 112 to 67 min apart. Cal hops on Finn's E3 at Dunblane, and they change together at St Madoes.

### Places to explore 🚧
- Places come from OpenStreetMap plus a hand-curated "Local gem" list, stored in the database.
- Each place is assigned to its nearest station.
- They're shown near the destination and at stations where friends meet while changing.
- `scripts/refresh_all.py` re-imports stations, the timetable and places. In production it would run nightly.

### Map routes ✅
Each journey leg is drawn along the real road. `GET /api/routes/line?trip_id=&from_area_id=&to_area_id=` returns Ember's GTFS route shape for that trip, cut between the boarding and alighting stops (by distance along the route).
- Lines are thinned to at most 150 points, so the map stays fast.
- Results are cached (about 20 ms first time, about 5 ms after).
- If a trip has no usable shape, it falls back to a straight line.

### Performance
- Plans are cached in memory, keyed by the meetup's current state (destination, time, window and friends). ✅
- The 5-second polling is therefore cheap. When someone joins, the key changes and the plan is recalculated once.
