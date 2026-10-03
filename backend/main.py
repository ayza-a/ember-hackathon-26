"""FastAPI app. FROZEN SHARED FILE: just mounts routers. Run: uvicorn backend.main:app --reload --port 8000"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db import init_db
from backend.routers import geo, meetups, places, plan

app = FastAPI(title="Ember Group Journeys")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

init_db()

app.include_router(meetups.router)
app.include_router(plan.router)
app.include_router(geo.router)
app.include_router(places.router)


@app.get("/api/health")
def health():
    return {"ok": True}
