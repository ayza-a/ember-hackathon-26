"""Plan + suggestion endpoints. OWNER: workstream 2 (Planner & API)."""
from fastapi import APIRouter, HTTPException

from backend import planner
from backend.models import MeetupSuggestion, Plan
from backend.routers.meetups import get_meetup

router = APIRouter(prefix="/api/meetups", tags=["plan"])


@router.get("/{slug}/plan", response_model=Plan)
def get_plan(slug: str):
    meetup = get_meetup(slug)
    if meetup.mode != "arrive" or not meetup.destination:
        raise HTTPException(409, "Meetup has no destination yet; pick a suggestion first")
    return planner.plan_arrive(meetup)


@router.get("/{slug}/suggestions", response_model=list[MeetupSuggestion])
def get_suggestions(slug: str):
    return planner.suggest(get_meetup(slug))
