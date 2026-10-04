"""Production entry point: one server for the API *and* the built frontend (frontend/dist).

Run locally:  cd frontend && npm run build && cd .. && uvicorn deploy.server:app --port 8080
In the container (see Dockerfile) this is what serves the public site.
"""
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.main import app

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        """Serve real files from dist (favicon etc.); every other route is the React app (/m/slug, /new/arrive...)."""
        if path.startswith("api/"):
            raise HTTPException(404)
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
