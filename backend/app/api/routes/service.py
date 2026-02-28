# backend/app/api/routes/service.py
"""서비스 간 통신용 API Key 인증 엔드포인트.

외부 서비스(예: n8n, AI 파이프라인)에서 사용자 인증 없이
API Key만으로 음성 파일 업로드 및 결과 조회를 수행합니다.
"""

import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import verify_service_key
from app.core.config import settings
from app.core.database import get_db
from app.models.note import Analysis, Note, Project, Transcript
from app.models.user import User
from app.schemas.note import AnalysisResponse, NoteResponse, TranscriptResponse
from app.services.queue import enqueue_job

router = APIRouter(
    prefix="/api/service",
    tags=["service"],
    dependencies=[Depends(verify_service_key)],
)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".webm", ".ogg", ".flac"}

# 서비스 전용 내부 계정 정보
SERVICE_USER_EMAIL = "service@internal"
SERVICE_USER_NAME = "Service Account"
SERVICE_PROJECT_NAME = "__service__"


async def _get_or_create_service_project(db: AsyncSession) -> Project:
    """서비스 전용 유저와 프로젝트를 가져오거나 자동 생성합니다."""
    # 서비스 전용 유저 조회 또는 생성
    result = await db.execute(select(User).where(User.email == SERVICE_USER_EMAIL))
    service_user = result.scalar_one_or_none()

    if not service_user:
        service_user = User(
            email=SERVICE_USER_EMAIL,
            name=SERVICE_USER_NAME,
            # 서비스 계정은 로그인 불가 — 임의 해시값 설정
            password_hash="!service-account-no-login",
        )
        db.add(service_user)
        await db.flush()

    # 서비스 전용 프로젝트 조회 또는 생성
    result = await db.execute(
        select(Project).where(
            Project.user_id == service_user.id,
            Project.name == SERVICE_PROJECT_NAME,
        )
    )
    service_project = result.scalar_one_or_none()

    if not service_project:
        service_project = Project(
            user_id=service_user.id,
            name=SERVICE_PROJECT_NAME,
            description="서비스 간 통신으로 생성된 노트를 관리하는 내부 프로젝트",
        )
        db.add(service_project)
        await db.flush()

    return service_project


@router.post("/upload", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def service_upload_note(
    file: UploadFile,
    title: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """서비스용 음성 파일 업로드.

    프로젝트/유저 지정 없이 독립 노트를 생성합니다.
    서비스 전용 프로젝트(__service__)에 자동 배치됩니다.
    """
    # 파일 확장자 검증
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식입니다: {ext}")

    # 서비스 전용 프로젝트 확보
    service_project = await _get_or_create_service_project(db)

    # 파일 저장
    file_id = str(uuid.uuid4())
    file_path = os.path.join(settings.upload_dir, f"{file_id}{ext}")
    os.makedirs(settings.upload_dir, exist_ok=True)

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # 노트 생성
    note = Note(
        project_id=service_project.id,
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


@router.get("/notes/{note_id}/transcript", response_model=TranscriptResponse)
async def service_get_transcript(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """서비스용 트랜스크립트 조회 (유저 인증 없이)."""
    result = await db.execute(
        select(Transcript).where(Transcript.note_id == note_id)
    )
    transcript = result.scalar_one_or_none()
    if not transcript:
        raise HTTPException(status_code=404, detail="트랜스크립트를 찾을 수 없습니다")
    return transcript


@router.get("/notes/{note_id}/analysis", response_model=AnalysisResponse)
async def service_get_analysis(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """서비스용 분석 결과 조회."""
    result = await db.execute(
        select(Analysis).where(Analysis.note_id == note_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="분석 결과를 찾을 수 없습니다")
    return analysis


@router.get("/notes/{note_id}/status")
async def service_get_note_status(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """서비스용 노트 처리 상태 조회."""
    result = await db.execute(select(Note).where(Note.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="노트를 찾을 수 없습니다")
    return {
        "note_id": note.id,
        "status": note.status,
        "title": note.title,
        "duration_seconds": note.duration_seconds,
        "created_at": note.created_at,
    }
