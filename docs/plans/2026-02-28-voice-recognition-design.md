# Voice Recognition Service - 설계 문서

**날짜**: 2026-02-28
**프로젝트**: 네이버 클로버 노트 유사 AI 음성 인식 서비스

## 개요

오디오 파일을 업로드하면 자동으로 텍스트 변환(STT), 화자 분리, AI 요약, 키워드 추출을 수행하고,
변환된 내용에 대해 대화형 AI로 질의할 수 있는 서비스.

## 결정 사항

| 항목 | 결정 | 근거 |
|------|------|------|
| 배포 | Docker + 운영 서버(192.168.0.5) | 기존 인프라 활용 |
| AI 모델 | 오픈소스 (Whisper + Pyannote + Ollama) | 무료, 데이터 프라이버시 |
| 백엔드 | Python FastAPI | AI/ML 생태계 통합 |
| 프론트엔드 | Next.js | SSR, React 생태계 |
| DB | PostgreSQL(5435) + Redis(6382) | JSONB로 비정형 데이터 처리, 큐/캐시 |
| 아키텍처 | 모놀리식 + 비동기 워커 | 6GB GPU 제약, 단순한 구조 |
| GPU | RTX 3060 Laptop 6GB (운영 서버) | Whisper medium 모델까지 가능 |

## 아키텍처

```
┌─────────────────────────────────────────────────┐
│                  Docker Compose                  │
│                 (192.168.0.5)                    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Next.js  │  │ FastAPI  │  │  AI Worker    │  │
│  │ Frontend │→→│   API    │→→│ (GPU 전용)    │  │
│  │ :3200    │  │ :8200    │  │               │  │
│  └──────────┘  └────┬─────┘  │ - Whisper     │  │
│                     │        │ - Pyannote    │  │
│                     ↓        │ - Ollama/LLM  │  │
│  ┌──────────┐  ┌──────────┐  └───────────────┘  │
│  │PostgreSQL│  │  Redis   │                      │
│  │  :5435   │  │  :6382   │                      │
│  └──────────┘  └──────────┘                      │
└─────────────────────────────────────────────────┘
```

### 컨테이너 구성 (6개)

| 컨테이너 | 포트 | 역할 |
|----------|------|------|
| voice-frontend | 3200 | Next.js 웹 UI |
| voice-api | 8200 | FastAPI REST API |
| voice-worker | - | AI 처리 워커 (GPU) |
| voice-postgres | 5435 | PostgreSQL DB |
| voice-redis | 6382 | 작업 큐 + 캐시 |
| voice-ollama | 11434 | 로컬 LLM (요약/대화) |

### AI 처리 파이프라인

GPU 6GB 제약으로 모델 순차 실행:

```
오디오 업로드 → Redis 큐 등록
    ↓
[Step 1] Whisper medium (STT) ~5GB VRAM
    ↓ 모델 언로드
[Step 2] Pyannote (화자 분리) ~1.5GB VRAM
    ↓ 모델 언로드
[Step 3] 결과 병합 (텍스트 + 화자 매핑)
    ↓
[Step 4] Ollama LLM (요약/키워드 추출) ~4GB VRAM
    ↓
결과 PostgreSQL 저장 + WebSocket으로 클라이언트 알림
```

## 데이터 모델

```sql
-- 사용자
users (id UUID PK, email, name, password_hash, created_at)

-- 프로젝트/폴더
projects (id UUID PK, user_id FK, name, description, created_at)

-- 노트 (하나의 오디오 = 하나의 노트)
notes (
    id UUID PK,
    project_id UUID FK,
    title VARCHAR,
    audio_path VARCHAR,
    duration_seconds FLOAT,
    language VARCHAR,
    status VARCHAR,  -- uploading/processing/completed/failed
    created_at TIMESTAMPTZ
)

-- 트랜스크립트 (STT + 화자 분리 결과)
transcripts (
    id UUID PK,
    note_id UUID FK,
    segments JSONB,         -- [{speaker, start, end, text, confidence}]
    full_text TEXT,
    search_vector TSVECTOR,
    created_at TIMESTAMPTZ
)

-- AI 분석 결과
analyses (
    id UUID PK,
    note_id UUID FK,
    summary TEXT,
    topics JSONB,           -- ["주제1", "주제2"]
    keywords JSONB,         -- ["키워드1", "키워드2"]
    action_items JSONB,     -- [{text, assignee, deadline}]
    created_at TIMESTAMPTZ
)

-- 북마크
bookmarks (
    id UUID PK,
    note_id UUID FK,
    timestamp_seconds FLOAT,
    label VARCHAR,
    created_at TIMESTAMPTZ
)

-- 대화형 AI 히스토리
chat_sessions (
    id UUID PK,
    note_id UUID FK,
    messages JSONB,         -- [{role, content, timestamp}]
    created_at TIMESTAMPTZ
)
```

## API 엔드포인트

```
POST   /api/auth/login
POST   /api/auth/register

GET    /api/projects
POST   /api/projects

POST   /api/notes/upload
GET    /api/notes/{id}
GET    /api/notes/{id}/status
DELETE /api/notes/{id}

GET    /api/notes/{id}/transcript
GET    /api/notes/{id}/analysis
POST   /api/notes/{id}/re-analyze

POST   /api/notes/{id}/bookmarks
GET    /api/notes/{id}/bookmarks

POST   /api/notes/{id}/chat
GET    /api/notes/{id}/chat/history

GET    /api/search?q=keyword
WS     /ws/notes/{id}/status
```

## 프론트엔드 주요 화면

1. **대시보드** - 최근 노트 목록, 프로젝트 네비게이션
2. **업로드 페이지** - 오디오 파일 드래그앤드롭, 실시간 녹음
3. **노트 상세 페이지** (핵심)
   - 오디오 플레이어 (재생/일시정지/구간 반복)
   - 트랜스크립트 뷰 (화자별 색상 구분, 타임스탬프 클릭 시 오디오 이동)
   - AI 요약 패널 (요약, 키워드, 액션 아이템)
   - 북마크 목록
   - 대화형 AI 채팅 사이드바
4. **검색 페이지** - 키워드로 전체 노트 검색

## 개발 에이전트 팀 구성

| 에이전트 | 역할 | 담당 영역 |
|----------|------|----------|
| orchestrator (리더) | 전체 조율 | 태스크 분배, 진행 관리 |
| backend-dev | 백엔드 개발 | FastAPI API, DB 스키마, 인증 |
| ai-pipeline-dev | AI 파이프라인 | Whisper, Pyannote, Ollama 통합, 워커 |
| frontend-dev | 프론트엔드 | Next.js UI, 오디오 플레이어, 채팅 |
| infra-dev | 인프라 | Docker Compose, GPU 설정, CI/CD |

## 기술 상세

### STT (Speech-to-Text)
- 모델: OpenAI Whisper medium (faster-whisper 라이브러리로 최적화)
- VRAM: ~5GB
- 지원 포맷: mp3, wav, m4a, webm, ogg
- 최대 길이: 180분

### 화자 분리 (Speaker Diarization)
- 모델: pyannote/speaker-diarization-3.1
- VRAM: ~1.5GB
- 사전 등록된 화자 라벨링 지원

### 텍스트 요약 및 대화형 AI
- 모델: Ollama (llama3.2 또는 gemma2)
- VRAM: ~4GB
- 기능: 요약, 키워드 추출, 액션 아이템, 자유 질의
