# backend/app/api/routes/notes.py
import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.note import Analysis, Bookmark, Note, Project, Transcript
from app.models.user import User
from app.schemas.note import (
    AnalysisResponse,
    BookmarkCreate,
    BookmarkResponse,
    NoteResponse,
    TranscriptResponse,
)
from app.services.queue import enqueue_job

router = APIRouter(prefix="/api/notes", tags=["notes"])

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".webm", ".ogg", ".flac"}


@router.post("/upload", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def upload_note(
    file: UploadFile,
    project_id: uuid.UUID,
    title: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 프로젝트 소유권 확인
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다")

    # 파일 확장자 검증
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식입니다: {ext}")

    # 파일 저장
    file_id = str(uuid.uuid4())
    file_path = os.path.join(settings.upload_dir, f"{file_id}{ext}")
    os.makedirs(settings.upload_dir, exist_ok=True)

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # 노트 생성
    note = Note(
        project_id=project_id,
        title=title or file.filename or "제목 없음",
        audio_path=file_path,
        status="queued",
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    # AI 처리 큐에 등록
    await enqueue_job(str(note.id), file_path)

    return note


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Note).join(Project).where(Note.id == note_id, Project.user_id == user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="노트를 찾을 수 없습니다")
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Note).join(Project).where(Note.id == note_id, Project.user_id == user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="노트를 찾을 수 없습니다")

    if os.path.exists(note.audio_path):
        os.remove(note.audio_path)

    await db.delete(note)
    await db.commit()


@router.get("/{note_id}/transcript", response_model=TranscriptResponse)
async def get_transcript(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transcript).join(Note).join(Project).where(
            Transcript.note_id == note_id, Project.user_id == user.id
        )
    )
    transcript = result.scalar_one_or_none()
    if not transcript:
        raise HTTPException(status_code=404, detail="트랜스크립트를 찾을 수 없습니다")
    return transcript


@router.get("/{note_id}/analysis", response_model=AnalysisResponse)
async def get_analysis(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Analysis).join(Note).join(Project).where(
            Analysis.note_id == note_id, Project.user_id == user.id
        )
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="분석 결과를 찾을 수 없습니다")
    return analysis


@router.post("/{note_id}/bookmarks", response_model=BookmarkResponse, status_code=status.HTTP_201_CREATED)
async def create_bookmark(
    note_id: uuid.UUID,
    req: BookmarkCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Note).join(Project).where(Note.id == note_id, Project.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="노트를 찾을 수 없습니다")

    bookmark = Bookmark(note_id=note_id, timestamp_seconds=req.timestamp_seconds, label=req.label)
    db.add(bookmark)
    await db.commit()
    await db.refresh(bookmark)
    return bookmark


@router.get("/{note_id}/bookmarks", response_model=list[BookmarkResponse])
async def list_bookmarks(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Bookmark).join(Note).join(Project).where(
            Bookmark.note_id == note_id, Project.user_id == user.id
        )
    )
    return result.scalars().all()
