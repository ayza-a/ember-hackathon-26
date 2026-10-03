"""Places endpoints. OWNER: workstream 4 (Discovery)."""
from fastapi import APIRouter

from backend import places
from backend.models import Place

router = APIRouter(prefix="/api/places", tags=["places"])


def _ids(area_ids: str) -> list[int]:
    return [int(x) for x in area_ids.split(",") if x.strip()]


@router.get("", response_model=list[Place])
def list_places(area_ids: str, category: str | None = None, limit: int = 20):
    """?area_ids=42,13&category=cafe"""
    return places.places_near(_ids(area_ids), category, limit)


@router.get("/summary", response_model=dict[int, dict[str, int]])
def places_summary(area_ids: str):
    return places.summary(_ids(area_ids))
