# Frontend mocks

Run `VITE_USE_MOCKS=1 npm run dev`, then open a scenario by its slug: `http://localhost:5173/m/<slug>`.

These are **real Ember journeys** from the GTFS timetable for **Saturday 10 Oct 2026**: real buses, times, changes, fares and route shapes. They show what the finished app produces, not what the current placeholder backend returns.

| Slug | File | What it shows |
|---|---|---|
| `misty-glen-42` | `arrive.json` | **The main demo.** 5 friends → Glasgow by 16:00. Changes (Thurso→Inverness→Glasgow, Aberdeen→Dundee→Glasgow), **meet while changing** (Isla & Ewan, 25 min at Inverness), **shared bus** (Isla & Ewan on the same E8), **hop-on** (Mhairi joins at Aviemore), Ben & Anna on the same E3 from Dundee. Spread 31 min, total £76.15 |
| `braw-puffin-17` | `suggest.json` | **"Where should we meet?"** 4 friends (Inverness, Glasgow, Aberdeen, Oban) with earliest departures. Top 3: Dundee, Perth, Inverness, with score breakdowns. `places_summary` counts are **illustrative** |
| `braw-puffin-17` after "Pick this" | `suggest_picked.json` | The same meetup after picking Dundee: becomes `mode: "arrive"` with a synced plan (Cal hops on Finn's E3 at Dunblane) |
| `wee-burn-03` | `arrive_edge.json` | Edge cases: a friend **already at the destination** (`note: "Already there"`), a friend with **no route** (`journey: null` + note), no meet events |
| `golden-loch-88` | `empty.json` | Freshly created meetup with **no friends yet** (the invite/empty state) |
| any other slug | | Falls back to `misty-glen-42` |

`routes.json` holds real route geometry for every leg above, keyed `trip_id:from_area_id:to_area_id`. `api.routeLine(...)` returns it in mock mode, so the map can draw the actual roads instead of straight lines. Each line is at most about 150 points.

Mock mode also:
- fakes about 300 ms of latency, so loading states are visible
- returns a sample service-update banner
- makes "join" return a fake friend, but nothing is persisted
- serves station search from the stations in the mocks

Places endpoints are **not** mocked; that data comes from the Discovery workstream.

## Design notes from the data
- Friend colours come from the backend (`friend.colour`). Up to 8 distinct colours.
- A journey has 1–3 legs. `leg.route_id` is Ember's route (E1–E21) and could be shown as a pill.
- Meet events of `kind: "same_bus"` can involve **3+ friends** (`friend_ids`). `start` is when the joiner boards; `end` is when the first of them gets off.
- `kind: "same_change"`: `start`–`end` is the overlap window when they're both waiting at `area`.
- Events are sorted by `start`. The same pair can have a same_change followed by a same_bus, which tells a little story.
- Times are ISO strings with a `+01:00` offset. Use `format.ts` `hhmm()`.
