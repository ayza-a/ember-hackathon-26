# One container: FastAPI backend + built React frontend + the timetable database.
# Deploy on any Docker host (Render, Fly.io, Railway...). The site listens on $PORT (default 8000).

# ---- 1. build the frontend
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. backend + data
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ backend/
COPY scripts/ scripts/
COPY deploy/ deploy/
# Build data/ember.db from Ember's API + GTFS timetable (~50 MB download) at image build time,
# so the server starts instantly. Places fall back to scripts/places_seed.json if Overpass is down.
RUN python scripts/refresh_all.py && rm -f data/gtfs.zip
COPY --from=web /app/frontend/dist frontend/dist
EXPOSE 8000
CMD ["sh", "-c", "uvicorn deploy.server:app --host 0.0.0.0 --port ${PORT}"]
