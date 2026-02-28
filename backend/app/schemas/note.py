# backend/app/schemas/note.py
import uuid
from datetime import datetime

from pydantic import BaseModel


class NoteResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    duration_seconds: float | None
    language: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TranscriptSegment(BaseModel):
    speaker: str
    start: float
    end: float
    text: str
    confidence: float | None = None


class TranscriptResponse(BaseModel):
    id: uuid.UUID
    note_id: uuid.UUID
    segments: list[TranscriptSegment]
    full_text: str | None

    model_config = {"from_attributes": True}


class AnalysisResponse(BaseModel):
    id: uuid.UUID
    note_id: uuid.UUID
    summary: str | None
    topics: list[str] | None
    keywords: list[str] | None
    action_items: list[dict] | None

    model_config = {"from_attributes": True}


class BookmarkCreate(BaseModel):
    timestamp_seconds: float
    label: str


class BookmarkResponse(BaseModel):
    id: uuid.UUID
    timestamp_seconds: float
    label: str
    created_at: datetime

    model_config = {"from_attributes": True}
