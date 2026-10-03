# Ember Group Journeys: hackathon plan

**Brief:** "What would you build to make getting around easier, more interesting, or more fun?"
Judged on **creativity and polish**. About 4 hours of build time, 4 people.

## The product
A web app for groups of friends travelling by Ember bus from different towns. A meetup is created and shared as a link (`/m/{slug}`), and each friend joins with their name and starting point.

1. **Mode 1: "Meet at X by T".** Plans everyone's journey, **including changes**, so the group arrives close together. It highlights where friends can:
   - **ride the same bus**: "Ben boards Anna's bus at Perth, 10:42"
   - **meet while changing at the same stop**: "Anna and Cal both change at Glasgow, 10:15–10:40: 25 min together"
2. **Mode 2: "Where should we meet?"** Each friend gives their origin and earliest departure. The app suggests the top 3 meeting places and times, minimising total travel time, total distance, and unfairness.
3. **Discovery.** Both modes suggest places near meeting points and change stops: cafés, viewpoints, walks, castles, from OpenStreetMap plus a hand-curated "Local gem" layer.

## Data sources (verified against the live API)
Base URL: `https://api.ember.to`. No auth is needed for anything we use.

| Need | Source |
|---|---|
| Stations / meeting points | `GET /v1/locations/?type=all`: STOP_AREAs (stations, ~451) and STOP_POINTs (stances, with `atco_code`, `area_id`, `lat`, `lon`) |
| Full timetable incl. changes | `GET /v1/gtfs/static/`: 51 MB GTFS zip, with ~650 stops, 20 routes (E1–E20), ~10k trips, ~155k stop_times, calendar, calendar_dates, fare_rules/fare_attributes, shapes |
| Autocomplete | `GET /v1/locations/search/?query=` |
| Route lines | `GET /v1/trips/{trip_uid}/geography/` (polyline precision 6, already lon,lat), or GTFS `shapes.txt` |
| Disruption banner | `GET /v1/service-updates/summary/` |
| Live price/seats (direct only) | `GET /v1/quotes/?origin&destination&departure_date_from&departure_date_to&adult=1` |
| Places | OpenStreetMap Overpass API + `scripts/curated_places.json` |

**Gotchas**
- `/v1/quotes/` is **direct-only** (one bus per quote; Ember doesn't support connections yet), so **we do our own routing over GTFS**.
- GTFS `stop_id` = ATCO code, and it maps to an Ember stop point's `atco_code`, whose `area_id` is the station. **Changes and meetings happen at the area level.**
- GTFS times can exceed 24:00 (`25:10:00`). Store them as seconds after midnight of the service date (Europe/London).
- Honour `pickup_type` / `drop_off_type` (1 = not allowed). Some stops are drop-off-only or pickup-only.
- `stop_times.shape_dist_traveled` is in **km**. Use it for "distance travelled".
- This is Ember's **production** API. Cache responses, keep request volume low, and **never call the order/payment/account endpoints**.

## Architecture
```
frontend (Vite + React + TS + Tailwind + MapLibre)  --/api proxy-->  backend (FastAPI)
                                                                      ├─ routing.py   (CSA over GTFS, in memory)
                                                                      ├─ planner.py   (mode 1, mode 2, meet events)
                                                                      ├─ places.py    (POIs near areas)
                                                                      ├─ ember_client.py (live API + cache)
                                                                      └─ SQLite: data/ember.db
scripts/ (import_ember_stops, import_gtfs, import_osm, refresh_all) → fill SQLite
```
"Updated regularly": `scripts/refresh_all.py` re-runs every import (idempotent). In production a scheduler would run it nightly (cron / GitHub Actions schedule / APScheduler).

## Routing engine: Connection Scan Algorithm (`backend/routing.py`)
A **connection** is one bus going between two consecutive stops: `(dep_area, arr_area, dep_s, arr_s, trip_id, dist_km)`. For a date, take the trips whose service runs that day (calendar + calendar_dates), build their connections, sort them by departure, and cache them per date.

- **Forward CSA** `earliest_arrivals(origin_area, depart_after, date)` does one linear scan and returns the earliest arrival at **every** area, each with its journey legs.
- **Reverse CSA** `latest_departures(dest_area, arrive_by, date)` scans backwards and returns, for **every** area, the latest departure that still arrives by the target time.
- Rules:
  - You can stay on the same trip.
  - Changing trips needs ≥ 5 min at the area.
  - You can't board where `pickup_type=1` or alight where `drop_off_type=1`.
- Sanity cases: Dundee → Edinburgh is direct; Oban → Dundee needs at least one change.

## Planner (`backend/planner.py`)
**Mode 1: synchronised arrival.** For candidate arrival times T′ ∈ [T−2h, T] in 10-min steps, run `latest_departures(dest, T′)` once; that covers every friend. Each friend takes their journey arriving by T′. Score = `spread_min + 0.25 × (T − T′)_min` and keep the lowest.

Example, target 12:00 in Edinburgh:

| T′ | Anna (Dundee) | Ben (Perth) | Cal (Stirling) | spread | score |
|---|---|---|---|---|---|
| 11:55 | 11:55 | 11:30 | 11:50 | 25 | **26.25** ✅ |
| 11:30 | 11:10 | 11:30 | 11:20 | 20 | 27.5 |

**Mode 2: where to meet.** Run `earliest_arrivals(origin_i, earliest_dep_i)` per friend. For every area reachable by all of them:
- `meet_time` = max(arrival)
- `total_travel` = Σ(arrival − departure)
- `total_km` = Σ km
- `spread` = max − min arrival

Score = `total_travel + 0.5 × spread + 0.5 × total_km` (tune it). Return the top 3, each with a places summary. "Pick this" creates a Mode 1 plan for that area and time, so early friends can leave later.

**Meet events.** Compare friends' legs pairwise:
- **same_bus:** same `trip_id` with overlapping stop ranges, meeting at the later boarder's stop.
- **same_change:** both at the same area with overlapping waiting windows during a change.

## Workstreams and ownership
**Rule: only edit files you own.** Shared contract files are frozen after Stage 1, so ask the team before changing them.

| # | Workstream | Owns | Branch |
|---|---|---|---|
| 1 | **Routing**: timetable engine | `backend/routing.py`, `backend/fares.py`, `tests/test_routing.py` | `feat/routing` |
| 2 | **Planner & API**: group logic + HTTP | `backend/planner.py`, `backend/ember_client.py`, `backend/routers/meetups.py`, `backend/routers/plan.py`, `backend/routers/geo.py` | `feat/planner` |
| 3 | **Frontend**: app flow, map, timeline | `frontend/src/pages/*`, `frontend/src/components/{MapView,Timeline,FriendCard,Suggestions,ServiceBanner}.tsx`, `frontend/src/App.tsx` | `feat/frontend` |
| 4 | **Discovery**: places data + UI | `scripts/import_osm.py`, `scripts/curated_places.json`, `scripts/refresh_all.py`, `backend/places.py`, `backend/routers/places.py`, `frontend/src/components/{PlacesPanel,PlaceCard,MeetEventCard}.tsx` | `feat/discovery` |
| — | **Frozen shared** (Stage 1) | `backend/main.py`, `backend/db.py`, `backend/models.py`, `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/mocks/*`, `scripts/import_ember_stops.py`, `scripts/import_gtfs.py` | `main` |

**Frozen interfaces between workstreams**
```python
# routing.py (1 → 2)
def earliest_arrivals(origin_area: int, depart_after: datetime) -> dict[int, Journey]
def latest_departures(dest_area: int, arrive_by: datetime) -> dict[int, Journey]
# places.py (4 → 2)
def places_near(area_ids: list[int], category: str | None = None, limit: int = 20) -> list[Place]
def summary(area_ids: list[int]) -> dict[int, dict[str, int]]   # area_id -> {category: count}
```
```ts
// frontend (4 → 3): Person 3's pages render Person 4's components
<PlacesPanel areaIds={number[]} onSelectPlace={(lat, lon) => void} />
<MeetEventCard event={MeetEvent} />
```

### 1 · Routing
- Build daily connections from GTFS tables, mapping ATCO codes to `area_id`. Cache them per date.
- Forward and reverse CSA with change time, pickup/drop-off rules, and times past 24h. Reconstruct legs.
- `fares.py`: price per leg from the `fares` table.
- Tests for the sanity cases. **Merge real routing to `main` by 1:50.**

### 2 · Planner & API
- `ember_client.py` (search, geography, service updates, quotes, all cached).
- Meetup create/join/get, plus a location search proxy (backed by the `areas` table).
- Planner Mode 1 and Mode 2, plus meet events. `routers/geo.py` provides route lines.
- Build against the routing stub, then swap to the real routing at ~1:50.

### 3 · Frontend
- Home (two mode cards), then Create meetup, then `/m/{slug}` with the invite link and a join form. Poll friends every 5 s.
- `MapView`: coloured line per friend, change markers, pulsing meet markers.
- `Timeline` (the hero visual): one lane per friend, legs/changes, meet connectors.
- `Suggestions` (Mode 2): top 3 cards with time/km/fairness bars and a "Pick this" button. `ServiceBanner`.
- Build on `src/mocks/*.json`, switching to the live API at ~2:20.

### 4 · Discovery
- `import_osm.py`: one Overpass query over the bbox of all areas. Tags:
  - cafe, restaurant, pub, ice_cream
  - viewpoint, attraction, museum, artwork
  - castle, monument
  - park, nature_reserve
  - bakery, books

  Assign each place to its nearest area within 800 m. Commit a `scripts/places_seed.json` fallback.
- `curated_places.json`: 15–20 gems near the demo hubs (Perth, Pitlochry, Stirling, Glasgow, Dundee, Edinburgh).
- `places.py` + `/api/places` routes. `PlacesPanel`, `PlaceCard` (⭐ Local gem badge), `MeetEventCard`.
- `refresh_all.py`. Stretch: the "make a day of it" scenic stopover.

## Timeline
| Time | Stage |
|---|---|
| 0:00–0:50 | **Stage 1**: skeleton, contracts, data imports, stubs (one laptop) |
| 0:50–2:50 | **Stage 2**: parallel work on feature branches; merge small and often |
| 2:50–3:20 | **Stage 3**: integrate (merge 1, then 2, then 4, then 3); run both demo scenarios |
| 3:20–4:00 | **Stage 4**: polish, loading/empty states, mobile, seed demo meetups, pitch |

**Fallback:** if CSA isn't working by 1:45, Mode 1 uses direct `/v1/quotes/` and CSA ships for Mode 2 only.

## Demo scenarios
- **Mode 1:** Oban + Dundee + Stirling → Edinburgh by 12:00 (shows a change and a meet event).
- **Mode 2:** Inverness + Glasgow + Aberdeen (shows a suggested meeting town with gems).

## Stretch ideas
- "Make a day of it": an early arriver hops off at a scenic intermediate stop and takes the next bus.
- Live mode: `/v1/vehicles/live/` (protobuf) to show friends' buses moving, plus delay alerts.
- Split-the-bill summary, and a "Book on Ember" link per leg.
