# backend/app/api/routes/search.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.note import Note, Project, Transcript
from app.models.user import User
from app.schemas.note import NoteResponse

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=list[NoteResponse])
async def search_notes(
    q: str = Query(..., min_length=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Note)
        .join(Transcript, Transcript.note_id == Note.id)
        .join(Project, Project.id == Note.project_id)
        .where(
            Project.user_id == user.id,
            Transcript.search_vector.op("@@")(func.plainto_tsquery("simple", q)),
        )
    )
    result = await db.execute(query)
    return result.scalars().all()
