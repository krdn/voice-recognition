# Voice Recognition Service - 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 네이버 클로버 노트 유사 AI 음성 인식 서비스를 Docker 기반으로 구축하여 운영 서버(192.168.0.5)에 배포

**Architecture:** FastAPI 모놀리식 API + Redis 큐 기반 비동기 AI 워커 + Next.js 프론트엔드. GPU 6GB 제약으로 WhisperX(STT+화자분리) → Ollama(요약/대화) 순차 파이프라인.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Redis 7, WhisperX, Ollama, Next.js 15, TypeScript, Docker Compose, NVIDIA Container Toolkit

**Design Doc:** `docs/plans/2026-02-28-voice-recognition-design.md`

---

## 에이전트 팀 구성

| 에이전트 | subagent_type | 역할 |
|----------|---------------|------|
| **orchestrator** | 리더 (메인 세션) | 태스크 분배, 코드 리뷰, 통합 |
| **infra-dev** | general-purpose | Docker Compose, DB 초기화, GPU 설정 |
| **backend-dev** | general-purpose | FastAPI API, DB 모델, 인증, WebSocket |
| **ai-pipeline-dev** | general-purpose | WhisperX, Ollama, AI 워커, 파이프라인 |
| **frontend-dev** | general-purpose | Next.js UI, 오디오 플레이어, 채팅 |

## Phase 개요

| Phase | 담당 에이전트 | 설명 | 의존성 |
|-------|--------------|------|--------|
| 1 | infra-dev | 프로젝트 골격 + Docker Compose + DB | 없음 |
| 2 | backend-dev | FastAPI 핵심 API (인증, CRUD) | Phase 1 |
| 3 | ai-pipeline-dev | AI 파이프라인 (WhisperX + Ollama) | Phase 1 |
| 4 | frontend-dev | Next.js 프론트엔드 | Phase 2 (API 필요) |
| 5 | backend-dev + ai-pipeline-dev | API-워커 통합 + WebSocket | Phase 2, 3 |
| 6 | 전체 | 통합 테스트 + Docker 배포 | Phase 4, 5 |

---

## Phase 1: 인프라 기반 구축 (infra-dev)

### Task 1.1: 프로젝트 디렉토리 구조 생성

**Files:**
- Create: `backend/` (FastAPI 프로젝트 루트)
- Create: `frontend/` (Next.js 프로젝트 루트)
- Create: `worker/` (AI 워커 프로젝트 루트)
- Create: `docker/` (Docker 관련 파일)

**Step 1: 디렉토리 구조 생성**

```bash
mkdir -p backend/app/{api/routes,core,models,schemas,services}
mkdir -p backend/tests
mkdir -p worker/app/{pipelines,services}
mkdir -p worker/tests
mkdir -p frontend
mkdir -p docker/{postgres,redis}
mkdir -p uploads
```

**Step 2: 백엔드 pyproject.toml 생성**

Create: `backend/pyproject.toml`

```toml
[project]
name = "voice-recognition-api"
version = "0.1.0"
description = "Voice Recognition Service API"
requires-python = ">=3.12"
dependencies = [
    "fastapi[standard]>=0.115.0",
    "sqlalchemy[asyncio]>=2.0.0",
    "asyncpg>=0.30.0",
    "redis>=5.0.0",
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",
    "python-multipart>=0.0.9",
    "alembic>=1.14.0",
    "pydantic-settings>=2.0.0",
    "aiofiles>=24.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "httpx>=0.27.0",
]
```

**Step 3: 워커 pyproject.toml 생성**

Create: `worker/pyproject.toml`

```toml
[project]
name = "voice-recognition-worker"
version = "0.1.0"
description = "Voice Recognition AI Worker"
requires-python = ">=3.12"
dependencies = [
    "whisperx>=3.1.0",
    "redis>=5.0.0",
    "sqlalchemy[asyncio]>=2.0.0",
    "asyncpg>=0.30.0",
    "httpx>=0.27.0",
    "pydantic-settings>=2.0.0",
]
```

**Step 4: 커밋**

```bash
git add -A
git commit -m "chore: 프로젝트 디렉토리 구조 초기화"
```

---

### Task 1.2: Docker Compose 설정

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/postgres/init.sql`
- Create: `.env.example`

**Step 1: docker-compose.yml 생성**

```yaml
services:
  voice-postgres:
    image: postgres:16-alpine
    container_name: voice-postgres
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-voice_recognition}
      POSTGRES_USER: ${POSTGRES_USER:-voice}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-voice_secret}
    ports:
      - "5435:5432"
    volumes:
      - voice_postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-voice}"]
      interval: 5s
      timeout: 5s
      retries: 5

  voice-redis:
    image: redis:7-alpine
    container_name: voice-redis
    ports:
      - "6382:6379"
    volumes:
      - voice_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  voice-api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: voice-api
    ports:
      - "8200:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-voice}:${POSTGRES_PASSWORD:-voice_secret}@voice-postgres:5432/${POSTGRES_DB:-voice_recognition}
      REDIS_URL: redis://voice-redis:6379/0
      UPLOAD_DIR: /app/uploads
      SECRET_KEY: ${SECRET_KEY:-dev-secret-key-change-in-production}
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      voice-postgres:
        condition: service_healthy
      voice-redis:
        condition: service_healthy

  voice-worker:
    build:
      context: ./worker
      dockerfile: Dockerfile
    container_name: voice-worker
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-voice}:${POSTGRES_PASSWORD:-voice_secret}@voice-postgres:5432/${POSTGRES_DB:-voice_recognition}
      REDIS_URL: redis://voice-redis:6379/0
      UPLOAD_DIR: /app/uploads
      OLLAMA_URL: http://voice-ollama:11434
      HF_TOKEN: ${HF_TOKEN}
    volumes:
      - ./uploads:/app/uploads
      - whisperx_cache:/root/.cache
    depends_on:
      voice-postgres:
        condition: service_healthy
      voice-redis:
        condition: service_healthy
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  voice-ollama:
    image: ollama/ollama:latest
    container_name: voice-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  voice-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: voice-frontend
    ports:
      - "3200:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://voice-api:8000
      NEXT_PUBLIC_WS_URL: ws://voice-api:8000
    depends_on:
      - voice-api

volumes:
  voice_postgres_data:
  voice_redis_data:
  ollama_data:
  whisperx_cache:
```

**Step 2: .env.example 생성**

```env
# PostgreSQL
POSTGRES_DB=voice_recognition
POSTGRES_USER=voice
POSTGRES_PASSWORD=voice_secret

# API
SECRET_KEY=change-this-to-a-random-secret-key

# HuggingFace (화자 분리 모델 다운로드용)
HF_TOKEN=hf_your_token_here
```

**Step 3: PostgreSQL 초기화 SQL 생성**

```sql
-- docker/postgres/init.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

**Step 4: 커밋**

```bash
git add docker-compose.yml .env.example docker/
git commit -m "infra: Docker Compose 설정 추가 (PostgreSQL, Redis, Ollama)"
```

---

### Task 1.3: 백엔드 Dockerfile 및 설정

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/database.py`
- Create: `backend/app/__init__.py`
- Create: `backend/app/core/__init__.py`

**Step 1: backend/Dockerfile 생성**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"

COPY . .

CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 2: config.py 생성**

```python
# backend/app/core/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://voice:voice_secret@localhost:5435/voice_recognition"
    redis_url: str = "redis://localhost:6382/0"
    secret_key: str = "dev-secret-key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24시간
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 500

    model_config = {"env_file": ".env"}


settings = Settings()
```

**Step 3: database.py 생성**

```python
# backend/app/core/database.py
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with async_session() as session:
        yield session
```

**Step 4: __init__.py 파일들 생성 (빈 파일)**

```bash
touch backend/app/__init__.py
touch backend/app/core/__init__.py
touch backend/app/api/__init__.py
touch backend/app/api/routes/__init__.py
touch backend/app/models/__init__.py
touch backend/app/schemas/__init__.py
touch backend/app/services/__init__.py
```

**Step 5: 커밋**

```bash
git add backend/
git commit -m "infra: 백엔드 Dockerfile 및 핵심 설정 추가"
```

---

### Task 1.4: 워커 Dockerfile

**Files:**
- Create: `worker/Dockerfile`
- Create: `worker/app/config.py`
- Create: `worker/app/__init__.py`

**Step 1: worker/Dockerfile 생성**

```dockerfile
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y \
    python3.12 python3.12-venv python3-pip ffmpeg git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY . .

CMD ["python3", "-m", "app.main"]
```

**Step 2: worker/app/config.py 생성**

```python
# worker/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://voice:voice_secret@localhost:5435/voice_recognition"
    redis_url: str = "redis://localhost:6382/0"
    upload_dir: str = "./uploads"
    ollama_url: str = "http://localhost:11434"
    hf_token: str = ""
    whisper_model: str = "medium"
    whisper_compute_type: str = "float16"
    whisper_batch_size: int = 8
    ollama_model: str = "llama3.2"

    model_config = {"env_file": ".env"}


settings = Settings()
```

**Step 3: __init__.py 생성**

```bash
touch worker/app/__init__.py
touch worker/app/pipelines/__init__.py
touch worker/app/services/__init__.py
```

**Step 4: 커밋**

```bash
git add worker/
git commit -m "infra: AI 워커 Dockerfile 및 설정 추가 (CUDA + WhisperX)"
```

---

### Task 1.5: DB 모델 정의 (SQLAlchemy)

**Files:**
- Create: `backend/app/models/base.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/note.py`

**Step 1: base.py 생성**

```python
# backend/app/models/base.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
```

**Step 2: user.py 생성**

```python
# backend/app/models/user.py
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))

    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
```

**Step 3: note.py 생성 (Project, Note, Transcript, Analysis, Bookmark, ChatSession)**

```python
# backend/app/models/note.py
import uuid

from sqlalchemy import ForeignKey, String, Text, Float
from sqlalchemy.dialects.postgresql import JSONB, UUID, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Project(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    user = relationship("User", back_populates="projects")
    notes = relationship("Note", back_populates="project", cascade="all, delete-orphan")


class Note(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notes"

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"))
    title: Mapped[str] = mapped_column(String(300))
    audio_path: Mapped[str] = mapped_column(String(500))
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="uploading")

    project = relationship("Project", back_populates="notes")
    transcript = relationship("Transcript", back_populates="note", uselist=False, cascade="all, delete-orphan")
    analysis = relationship("Analysis", back_populates="note", uselist=False, cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="note", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="note", cascade="all, delete-orphan")


class Transcript(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "transcripts"

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id"), unique=True)
    segments: Mapped[dict] = mapped_column(JSONB, default=list)
    full_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)

    note = relationship("Note", back_populates="transcript")


class Analysis(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "analyses"

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id"), unique=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    topics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    keywords: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    action_items: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    note = relationship("Note", back_populates="analysis")


class Bookmark(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "bookmarks"

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id"))
    timestamp_seconds: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(200))

    note = relationship("Note", back_populates="bookmarks")


class ChatSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "chat_sessions"

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id"))
    messages: Mapped[dict] = mapped_column(JSONB, default=list)

    note = relationship("Note", back_populates="chat_sessions")
```

**Step 4: models/__init__.py 업데이트**

```python
# backend/app/models/__init__.py
from app.models.base import Base
from app.models.user import User
from app.models.note import Project, Note, Transcript, Analysis, Bookmark, ChatSession

__all__ = ["Base", "User", "Project", "Note", "Transcript", "Analysis", "Bookmark", "ChatSession"]
```

**Step 5: 커밋**

```bash
git add backend/app/models/
git commit -m "feat: SQLAlchemy DB 모델 정의 (User, Project, Note, Transcript, Analysis)"
```

---

## Phase 2: 백엔드 API (backend-dev)

### Task 2.1: FastAPI 앱 엔트리포인트 + 헬스체크

**Files:**
- Create: `backend/app/main.py`

**Step 1: 테스트 작성**

Create: `backend/tests/test_health.py`

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

**Step 2: 테스트 실행 (실패 확인)**

```bash
cd backend && python -m pytest tests/test_health.py -v
```

Expected: FAIL (app.main 없음)

**Step 3: main.py 구현**

```python
# backend/app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))
    yield
    await engine.dispose()


app = FastAPI(title="Voice Recognition API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
```

**Step 4: 테스트 실행 (통과 확인)**

```bash
cd backend && python -m pytest tests/test_health.py -v
```

Expected: PASS

**Step 5: 커밋**

```bash
git add backend/app/main.py backend/tests/
git commit -m "feat: FastAPI 앱 엔트리포인트 및 헬스체크 추가"
```

---

### Task 2.2: 인증 API (회원가입/로그인)

**Files:**
- Create: `backend/app/core/security.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/api/routes/auth.py`
- Create: `backend/tests/test_auth.py`

**Step 1: 테스트 작성**

```python
# backend/tests/test_auth.py
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_register():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/auth/register", json={
            "email": "test@example.com",
            "name": "테스트",
            "password": "password123"
        })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "id" in data


@pytest.mark.asyncio
async def test_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 회원가입 후 로그인
        await client.post("/api/auth/register", json={
            "email": "login@example.com",
            "name": "로그인테스트",
            "password": "password123"
        })
        response = await client.post("/api/auth/login", json={
            "email": "login@example.com",
            "password": "password123"
        })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
```

**Step 2: security.py 구현**

```python
# backend/app/core/security.py
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
```

**Step 3: schemas/auth.py 구현**

```python
# backend/app/schemas/auth.py
import uuid

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

**Step 4: api/routes/auth.py 구현**

```python
# backend/app/api/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 등록된 이메일입니다")

    user = User(email=req.email, name=req.name, password_hash=hash_password(req.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)
```

**Step 5: main.py에 라우터 등록**

```python
# backend/app/main.py 에 추가
from app.api.routes.auth import router as auth_router

app.include_router(auth_router)
```

**Step 6: 커밋**

```bash
git add backend/
git commit -m "feat: 인증 API 추가 (회원가입, 로그인, JWT)"
```

---

### Task 2.3: 프로젝트 CRUD API

**Files:**
- Create: `backend/app/schemas/project.py`
- Create: `backend/app/api/routes/projects.py`
- Create: `backend/app/api/deps.py`

**Step 1: 인증 의존성 (deps.py)**

```python
# backend/app/api/deps.py
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[settings.algorithm])
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰입니다")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다")
    return user
```

**Step 2: schemas/project.py**

```python
# backend/app/schemas/project.py
import uuid
from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
```

**Step 3: api/routes/projects.py**

```python
# backend/app/api/routes/projects.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.note import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.user_id == user.id))
    return result.scalars().all()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    req: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(user_id=user.id, name=req.name, description=req.description)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project
```

**Step 4: main.py에 라우터 등록**

```python
from app.api.routes.projects import router as projects_router

app.include_router(projects_router)
```

**Step 5: 커밋**

```bash
git add backend/
git commit -m "feat: 프로젝트 CRUD API 추가"
```

---

### Task 2.4: 노트 업로드 + CRUD API

**Files:**
- Create: `backend/app/schemas/note.py`
- Create: `backend/app/api/routes/notes.py`
- Create: `backend/app/services/queue.py`

**Step 1: schemas/note.py**

```python
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
```

**Step 2: services/queue.py (Redis 큐)**

```python
# backend/app/services/queue.py
import json

import redis.asyncio as redis

from app.core.config import settings

redis_client = redis.from_url(settings.redis_url, decode_responses=True)

QUEUE_NAME = "voice:jobs"


async def enqueue_job(note_id: str, audio_path: str) -> None:
    job = json.dumps({"note_id": note_id, "audio_path": audio_path})
    await redis_client.rpush(QUEUE_NAME, job)


async def publish_status(note_id: str, status: str, progress: int = 0) -> None:
    message = json.dumps({"note_id": note_id, "status": status, "progress": progress})
    await redis_client.publish(f"voice:status:{note_id}", message)
```

**Step 3: api/routes/notes.py**

```python
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
```

**Step 4: main.py에 라우터 등록**

```python
from app.api.routes.notes import router as notes_router

app.include_router(notes_router)
```

**Step 5: 커밋**

```bash
git add backend/
git commit -m "feat: 노트 업로드/CRUD API 및 Redis 큐 서비스 추가"
```

---

### Task 2.5: 대화형 AI 채팅 API + WebSocket

**Files:**
- Create: `backend/app/api/routes/chat.py`
- Create: `backend/app/api/routes/ws.py`
- Create: `backend/app/schemas/chat.py`

**Step 1: schemas/chat.py**

```python
# backend/app/schemas/chat.py
import uuid
from datetime import datetime

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    session_id: uuid.UUID


class ChatHistoryResponse(BaseModel):
    id: uuid.UUID
    messages: list[ChatMessage]
    created_at: datetime

    model_config = {"from_attributes": True}
```

**Step 2: api/routes/chat.py**

```python
# backend/app/api/routes/chat.py
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import httpx

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.note import Analysis, ChatSession, Note, Project, Transcript
from app.models.user import User
from app.schemas.chat import ChatHistoryResponse, ChatRequest, ChatResponse

router = APIRouter(prefix="/api/notes", tags=["chat"])

OLLAMA_URL = "http://voice-ollama:11434"


@router.post("/{note_id}/chat", response_model=ChatResponse)
async def chat_with_note(
    note_id: uuid.UUID,
    req: ChatRequest,
    session_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 노트 소유권 확인
    result = await db.execute(
        select(Note).join(Project).where(Note.id == note_id, Project.user_id == user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="노트를 찾을 수 없습니다")

    # 트랜스크립트 로드
    t_result = await db.execute(select(Transcript).where(Transcript.note_id == note_id))
    transcript = t_result.scalar_one_or_none()

    # 분석 결과 로드
    a_result = await db.execute(select(Analysis).where(Analysis.note_id == note_id))
    analysis = a_result.scalar_one_or_none()

    # 세션 로드 또는 생성
    if session_id:
        s_result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
        session = s_result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="채팅 세션을 찾을 수 없습니다")
        messages = session.messages or []
    else:
        session = ChatSession(note_id=note_id, messages=[])
        db.add(session)
        messages = []

    # 시스템 프롬프트 구성
    context_parts = []
    if transcript and transcript.full_text:
        context_parts.append(f"[트랜스크립트]\n{transcript.full_text[:4000]}")
    if analysis and analysis.summary:
        context_parts.append(f"[요약]\n{analysis.summary}")
    if analysis and analysis.keywords:
        context_parts.append(f"[키워드]\n{', '.join(analysis.keywords)}")

    system_prompt = (
        "당신은 음성 녹음 내용을 분석하는 AI 어시스턴트입니다. "
        "아래 녹음 내용을 바탕으로 사용자의 질문에 답변해주세요.\n\n"
        + "\n\n".join(context_parts)
    )

    # 사용자 메시지 추가
    messages.append({"role": "user", "content": req.message, "timestamp": datetime.now(timezone.utc).isoformat()})

    # Ollama API 호출
    ollama_messages = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        ollama_messages.append({"role": msg["role"], "content": msg["content"]})

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={"model": "llama3.2", "messages": ollama_messages, "stream": False},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="AI 서비스 응답 오류")

    reply = resp.json()["message"]["content"]

    # 어시스턴트 응답 추가
    messages.append({"role": "assistant", "content": reply, "timestamp": datetime.now(timezone.utc).isoformat()})
    session.messages = messages
    await db.commit()
    await db.refresh(session)

    return ChatResponse(reply=reply, session_id=session.id)


@router.get("/{note_id}/chat/history", response_model=list[ChatHistoryResponse])
async def chat_history(
    note_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSession).join(Note).join(Project).where(
            ChatSession.note_id == note_id, Project.user_id == user.id
        )
    )
    return result.scalars().all()
```

**Step 3: api/routes/ws.py (WebSocket 상태 알림)**

```python
# backend/app/api/routes/ws.py
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import redis.asyncio as redis

from app.core.config import settings

router = APIRouter()


@router.websocket("/ws/notes/{note_id}/status")
async def note_status_ws(websocket: WebSocket, note_id: str):
    await websocket.accept()
    r = redis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"voice:status:{note_id}")

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                await websocket.send_text(message["data"])
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"voice:status:{note_id}")
        await r.aclose()
```

**Step 4: main.py에 라우터 등록**

```python
from app.api.routes.chat import router as chat_router
from app.api.routes.ws import router as ws_router

app.include_router(chat_router)
app.include_router(ws_router)
```

**Step 5: 커밋**

```bash
git add backend/
git commit -m "feat: 대화형 AI 채팅 API 및 WebSocket 상태 알림 추가"
```

---

### Task 2.6: 검색 API

**Files:**
- Create: `backend/app/api/routes/search.py`

**Step 1: search.py**

```python
# backend/app/api/routes/search.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
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
```

**Step 2: main.py에 등록 + 커밋**

```bash
git add backend/
git commit -m "feat: 전문 검색 API 추가 (tsvector)"
```

---

## Phase 3: AI 파이프라인 (ai-pipeline-dev)

### Task 3.1: WhisperX STT 파이프라인

**Files:**
- Create: `worker/app/pipelines/stt.py`

**Step 1: stt.py 구현**

```python
# worker/app/pipelines/stt.py
import gc
import logging

import torch
import whisperx

from worker.app.config import settings

logger = logging.getLogger(__name__)


def transcribe_audio(audio_path: str) -> dict:
    """WhisperX로 음성을 텍스트로 변환 + 화자 분리"""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = settings.whisper_compute_type if device == "cuda" else "int8"

    logger.info(f"STT 시작: {audio_path} (device={device})")

    # Step 1: 음성 인식 (Whisper)
    model = whisperx.load_model(
        settings.whisper_model,
        device,
        compute_type=compute_type,
    )
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio, batch_size=settings.whisper_batch_size)
    detected_language = result["language"]
    logger.info(f"언어 감지: {detected_language}")

    # GPU 메모리 해제
    del model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()

    # Step 2: 단어 정렬 (Alignment)
    model_a, metadata = whisperx.load_align_model(
        language_code=detected_language,
        device=device,
    )
    result = whisperx.align(result["segments"], model_a, metadata, audio, device)

    del model_a
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()

    # Step 3: 화자 분리 (Diarization)
    if settings.hf_token:
        from whisperx.diarize import DiarizationPipeline

        diarize_model = DiarizationPipeline(
            use_auth_token=settings.hf_token,
            device=device,
        )
        diarize_segments = diarize_model(audio)
        result = whisperx.assign_word_speakers(diarize_segments, result)

        del diarize_model
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()

    # 결과 구성
    segments = []
    for seg in result["segments"]:
        segments.append({
            "speaker": seg.get("speaker", "SPEAKER_00"),
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip(),
            "confidence": round(seg.get("score", 0.0), 3) if "score" in seg else None,
        })

    full_text = " ".join(s["text"] for s in segments)

    return {
        "segments": segments,
        "full_text": full_text,
        "language": detected_language,
    }
```

**Step 2: 커밋**

```bash
git add worker/
git commit -m "feat: WhisperX STT + 화자 분리 파이프라인 구현"
```

---

### Task 3.2: Ollama 요약/키워드 추출 파이프라인

**Files:**
- Create: `worker/app/pipelines/analysis.py`

**Step 1: analysis.py 구현**

```python
# worker/app/pipelines/analysis.py
import json
import logging

import httpx

from worker.app.config import settings

logger = logging.getLogger(__name__)


async def analyze_transcript(full_text: str, language: str = "ko") -> dict:
    """Ollama LLM으로 텍스트 요약, 키워드 추출, 액션 아이템 추출"""
    prompt = f"""다음 음성 녹음 텍스트를 분석해주세요.

[텍스트]
{full_text[:6000]}

아래 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{{
    "summary": "전체 내용을 3-5문장으로 요약",
    "topics": ["주요 주제1", "주요 주제2", "주요 주제3"],
    "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
    "action_items": [
        {{"text": "해야 할 일 설명", "assignee": "담당자 (알 수 없으면 null)", "deadline": "기한 (알 수 없으면 null)"}}
    ]
}}"""

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/generate",
            json={
                "model": settings.ollama_model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
            },
        )

    if resp.status_code != 200:
        logger.error(f"Ollama 응답 오류: {resp.status_code}")
        return {"summary": None, "topics": [], "keywords": [], "action_items": []}

    try:
        response_text = resp.json()["response"]
        result = json.loads(response_text)
        return {
            "summary": result.get("summary"),
            "topics": result.get("topics", []),
            "keywords": result.get("keywords", []),
            "action_items": result.get("action_items", []),
        }
    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"Ollama 응답 파싱 오류: {e}")
        return {"summary": None, "topics": [], "keywords": [], "action_items": []}
```

**Step 2: 커밋**

```bash
git add worker/
git commit -m "feat: Ollama 기반 텍스트 요약/키워드 추출 파이프라인 구현"
```

---

### Task 3.3: AI 워커 메인 루프

**Files:**
- Create: `worker/app/main.py`
- Create: `worker/app/services/db.py`

**Step 1: services/db.py (DB 저장 헬퍼)**

```python
# worker/app/services/db.py
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from worker.app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

**Step 2: worker/app/main.py (메인 워커 루프)**

```python
# worker/app/main.py
import asyncio
import json
import logging

import redis.asyncio as redis
from sqlalchemy import select, update

from worker.app.config import settings
from worker.app.pipelines.analysis import analyze_transcript
from worker.app.pipelines.stt import transcribe_audio
from worker.app.services.db import async_session

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

QUEUE_NAME = "voice:jobs"


async def publish_status(r: redis.Redis, note_id: str, status: str, progress: int = 0):
    msg = json.dumps({"note_id": note_id, "status": status, "progress": progress})
    await r.publish(f"voice:status:{note_id}", msg)


async def process_job(r: redis.Redis, job_data: dict):
    note_id = job_data["note_id"]
    audio_path = job_data["audio_path"]

    logger.info(f"작업 시작: note_id={note_id}")

    # DB import (워커에서 직접 모델 사용을 피하고 raw SQL 사용)
    async with async_session() as db:
        # 상태 업데이트: processing
        await db.execute(
            update_note_status(note_id, "processing")
        )
        await db.commit()

    try:
        # Step 1: STT + 화자 분리
        await publish_status(r, note_id, "stt", 10)
        stt_result = transcribe_audio(audio_path)
        await publish_status(r, note_id, "stt_done", 50)

        # Step 2: DB에 트랜스크립트 저장
        async with async_session() as db:
            from sqlalchemy import text

            await db.execute(
                text("""
                    INSERT INTO transcripts (id, note_id, segments, full_text, search_vector, created_at, updated_at)
                    VALUES (gen_random_uuid(), :note_id, :segments, :full_text,
                            to_tsvector('simple', :full_text), now(), now())
                """),
                {
                    "note_id": note_id,
                    "segments": json.dumps(stt_result["segments"]),
                    "full_text": stt_result["full_text"],
                },
            )

            # 노트 언어/길이 업데이트
            await db.execute(
                text("""
                    UPDATE notes SET language = :language, status = 'analyzing'
                    WHERE id = :note_id::uuid
                """),
                {"language": stt_result["language"], "note_id": note_id},
            )
            await db.commit()

        # Step 3: AI 분석 (요약/키워드)
        await publish_status(r, note_id, "analyzing", 70)
        analysis = await analyze_transcript(stt_result["full_text"], stt_result["language"])
        await publish_status(r, note_id, "analyzing_done", 90)

        # Step 4: DB에 분석 결과 저장
        async with async_session() as db:
            from sqlalchemy import text

            await db.execute(
                text("""
                    INSERT INTO analyses (id, note_id, summary, topics, keywords, action_items, created_at, updated_at)
                    VALUES (gen_random_uuid(), :note_id, :summary, :topics, :keywords, :action_items, now(), now())
                """),
                {
                    "note_id": note_id,
                    "summary": analysis["summary"],
                    "topics": json.dumps(analysis["topics"]),
                    "keywords": json.dumps(analysis["keywords"]),
                    "action_items": json.dumps(analysis["action_items"]),
                },
            )

            await db.execute(
                text("UPDATE notes SET status = 'completed' WHERE id = :note_id::uuid"),
                {"note_id": note_id},
            )
            await db.commit()

        await publish_status(r, note_id, "completed", 100)
        logger.info(f"작업 완료: note_id={note_id}")

    except Exception as e:
        logger.error(f"작업 실패: note_id={note_id}, error={e}")
        async with async_session() as db:
            from sqlalchemy import text

            await db.execute(
                text("UPDATE notes SET status = 'failed' WHERE id = :note_id::uuid"),
                {"note_id": note_id},
            )
            await db.commit()
        await publish_status(r, note_id, "failed", 0)


def update_note_status(note_id: str, status: str):
    from sqlalchemy import text

    return text("UPDATE notes SET status = :status WHERE id = :note_id::uuid").bindparams(
        status=status, note_id=note_id
    )


async def main():
    logger.info("AI 워커 시작...")
    r = redis.from_url(settings.redis_url, decode_responses=True)

    while True:
        # 블로킹 팝 (5초 타임아웃)
        result = await r.blpop(QUEUE_NAME, timeout=5)
        if result:
            _, job_json = result
            job_data = json.loads(job_json)
            await process_job(r, job_data)


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 3: 커밋**

```bash
git add worker/
git commit -m "feat: AI 워커 메인 루프 구현 (큐 소비 → STT → 분석 → 저장)"
```

---

## Phase 4: 프론트엔드 (frontend-dev)

### Task 4.1: Next.js 프로젝트 초기화

**Step 1: Next.js 프로젝트 생성**

```bash
cd /home/gon/projects/ai/voice-recognition
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

**Step 2: 필요한 패키지 설치**

```bash
cd frontend
pnpm add axios wavesurfer.js zustand
pnpm add -D @types/node
```

**Step 3: Dockerfile 생성**

Create: `frontend/Dockerfile`

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["node", "server.js"]
```

**Step 4: 커밋**

```bash
git add frontend/
git commit -m "feat: Next.js 프로젝트 초기화 (TypeScript, Tailwind)"
```

---

### Task 4.2: API 클라이언트 + 인증 스토어

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/stores/auth.ts`

**Step 1: lib/api.ts**

```typescript
// frontend/src/lib/api.ts
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8200";

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**Step 2: stores/auth.ts**

```typescript
// frontend/src/stores/auth.ts
import { create } from "zustand";
import { api } from "@/lib/api";

interface AuthState {
  token: string | null;
  user: { id: string; email: string; name: string } | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: typeof window !== "undefined" ? localStorage.getItem("token") : null,
  user: null,
  login: async (email, password) => {
    const { data } = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("token", data.access_token);
    set({ token: data.access_token });
  },
  register: async (email, name, password) => {
    await api.post("/api/auth/register", { email, name, password });
  },
  logout: () => {
    localStorage.removeItem("token");
    set({ token: null, user: null });
  },
}));
```

**Step 3: 커밋**

```bash
git add frontend/src/
git commit -m "feat: API 클라이언트 및 인증 스토어 추가"
```

---

### Task 4.3: 대시보드 + 노트 목록 페이지

**Files:**
- Create: `frontend/src/app/dashboard/page.tsx`
- Create: `frontend/src/app/login/page.tsx`

(상세 컴포넌트 코드는 구현 시 frontend-design 스킬 활용)

**Step 1: 로그인 페이지 구현**
**Step 2: 대시보드 페이지 구현 (프로젝트 목록, 노트 목록)**
**Step 3: 커밋**

---

### Task 4.4: 노트 상세 페이지 (핵심 화면)

**Files:**
- Create: `frontend/src/app/notes/[id]/page.tsx`
- Create: `frontend/src/components/AudioPlayer.tsx`
- Create: `frontend/src/components/TranscriptView.tsx`
- Create: `frontend/src/components/AnalysisPanel.tsx`
- Create: `frontend/src/components/ChatSidebar.tsx`

**Step 1: 오디오 플레이어 컴포넌트 (wavesurfer.js)**
**Step 2: 트랜스크립트 뷰 (화자별 색상, 타임스탬프 클릭)**
**Step 3: AI 분석 패널 (요약, 키워드, 액션 아이템)**
**Step 4: 대화형 AI 채팅 사이드바**
**Step 5: 노트 상세 페이지 조립**
**Step 6: 커밋**

---

### Task 4.5: 업로드 페이지

**Files:**
- Create: `frontend/src/app/upload/page.tsx`
- Create: `frontend/src/components/FileUploader.tsx`
- Create: `frontend/src/hooks/useWebSocket.ts`

**Step 1: WebSocket 훅 (실시간 진행 상태)**
**Step 2: 파일 업로더 컴포넌트 (드래그앤드롭)**
**Step 3: 업로드 페이지 조립**
**Step 4: 커밋**

---

## Phase 5: 통합 (backend-dev + ai-pipeline-dev)

### Task 5.1: Alembic 마이그레이션 설정

**Step 1: Alembic 초기화**

```bash
cd backend && alembic init alembic
```

**Step 2: alembic/env.py 수정 (async 지원)**
**Step 3: 첫 마이그레이션 생성 + 적용**
**Step 4: 커밋**

---

### Task 5.2: 통합 테스트

**Step 1: Docker Compose로 전체 서비스 기동**

```bash
docker compose up -d voice-postgres voice-redis
```

**Step 2: 마이그레이션 실행**
**Step 3: API 헬스체크 테스트**
**Step 4: 오디오 업로드 → STT → 분석 end-to-end 테스트**
**Step 5: 커밋**

---

## Phase 6: 배포 (전체 팀)

### Task 6.1: 운영 서버 배포

**Step 1: .env 파일 생성 (운영용)**
**Step 2: Ollama 모델 다운로드**

```bash
docker exec voice-ollama ollama pull llama3.2
```

**Step 3: Docker Compose 빌드 + 배포**

```bash
ssh gon@192.168.0.5
cd /path/to/project
docker compose up -d --build
```

**Step 4: NVIDIA Container Toolkit 확인**

```bash
docker exec voice-worker nvidia-smi
```

**Step 5: 기능 검증**
**Step 6: 최종 커밋**

---

## 에이전트 병렬 실행 계획

```
시간축 →
──────────────────────────────────────────────
Phase 1 (infra-dev)        ████████
Phase 2 (backend-dev)              ████████████
Phase 3 (ai-pipeline-dev)         ████████████
Phase 4 (frontend-dev)                    ████████████
Phase 5 (통합)                                    ████
Phase 6 (배포)                                        ████
──────────────────────────────────────────────
```

- Phase 2와 3은 Phase 1 완료 후 **병렬 실행**
- Phase 4는 Phase 2 (API) 의존, Phase 2 중간부터 시작 가능
- Phase 5는 Phase 2, 3 완료 후 실행
- Phase 6은 Phase 4, 5 완료 후 실행
