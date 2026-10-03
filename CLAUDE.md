# Ember Group Journeys (hackathon)

Group bus-journey planner on Ember's API: friends from different towns get synchronised journeys (changes included), see where they share a bus or change stop, get "where should we meet?" suggestions, and discover places along the way.

**Read `docs/PLAN.md` before doing anything.** It has the design, algorithms, data gotchas, workstreams and timeline.

## Team rules (4 people working in parallel; avoid merge conflicts)
- **Only edit files owned by your workstream** (see the ownership table in `docs/PLAN.md`). Ask the user which workstream they're on if it's unclear.
- **Frozen shared contracts:** `backend/main.py`, `backend/db.py`, `backend/models.py`, `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/format.ts`, `frontend/src/mocks/*`, `requirements.txt`, `frontend/package.json`, `scripts/import_ember_stops.py`, `scripts/import_gtfs.py`. Don't change these without the team agreeing. If a change is unavoidable, keep it additive (new optional fields) and tell the user to announce it.
- Keep the frozen function signatures in `backend/routing.py` and `backend/places.py` unchanged. Replace the stub *bodies* only.
- Work on your branch (`feat/routing`, `feat/planner`, `feat/frontend`, `feat/discovery`). Pull `main` often and merge small.
- `backend/models.py` and `frontend/src/types.ts` must stay in sync.

## Run
```bash
# backend (from repo root); on Windows use `py` instead of `python`
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/refresh_all.py                                          # one-off, fills data/ember.db
uvicorn backend.main:app --reload --port 8000                           # API docs at http://localhost:8000/docs

# frontend
cd frontend && npm install && npm run dev                               # http://localhost:5173, proxies /api -> :8000
# frontend without backend: VITE_USE_MOCKS=1 npm run dev
# tests: pytest tests/
```

## Key facts
- Ember API base: `https://api.ember.to`. It's **production**: cache, keep request volume low, and never call order/payment/account endpoints.
- `/v1/quotes/` is direct-only, which is why routing with changes runs over the GTFS timetable in `backend/routing.py`.
- GTFS `stop_id` is an ATCO code, mapped to `stop_points.area_id`. Areas (stations) are where changes and meetings happen.
- GTFS times can go past 24:00. They're stored as seconds after midnight of the service date (Europe/London).
- SQLite DB lives at `data/ember.db` (gitignored). Rebuild it with `python scripts/refresh_all.py`.

## Conventions
- Times are tz-aware Europe/London datetimes in Python and ISO strings with offset in TS.
- Find what's still stubbed with `grep -rn "STUB\|TODO" backend scripts frontend/src`.
- Station lookup: `backend.db.load_areas()` (cached dict, most popular first).
