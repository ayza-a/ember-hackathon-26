# Ember Group Journeys

Friends travelling by [Ember](https://www.ember.to) bus from different towns get journeys that **arrive together** (changes included). The app shows where they can **share a bus or meet while changing**, suggests **where to meet**, and recommends **places to explore** on the way.

See [`docs/PLAN.md`](docs/PLAN.md) for the design and team workstreams.

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
