# Voice Recognition Service

네이버 클로버 노트 스타일의 AI 음성 인식 서비스.
오디오 파일 업로드 또는 브라우저 녹음 → STT(WhisperX) → 화자 분리 → AI 요약(Ollama) → 대화형 AI 채팅.

## 주요 기능

- **음성 인식(STT)**: WhisperX 기반 GPU 가속 전사 (한국어/영어 자동 감지)
- **화자 분리**: 다중 화자 자동 구분 (Speaker Diarization)
- **AI 분석**: 요약, 주제 추출, 키워드, 액션 아이템 자동 생성
- **대화형 AI**: 녹음 내용 기반 Q&A 채팅
- **브라우저 녹음**: MediaRecorder API로 직접 녹음 후 업로드
- **실시간 상태**: WebSocket으로 처리 진행률 실시간 전달
- **전문 검색**: PostgreSQL Full-Text Search로 전사 텍스트 검색

## 기술 스택

| 영역 | 기술 |
|------|------|
| **프론트엔드** | Next.js 15, React 19, TypeScript, Tailwind CSS, wavesurfer.js, zustand |
| **백엔드 API** | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), asyncpg |
| **AI Worker** | WhisperX (STT + 화자 분리), Ollama llama3.2:3b (요약/채팅) |
| **데이터베이스** | PostgreSQL 16, Redis 7 |
| **인프라** | Docker Compose, Nginx, NVIDIA Container Toolkit |

## 아키텍처

```
┌─────────────┐     HTTPS      ┌─────────┐
│   Browser    │ ◄───────────► │  Nginx   │
└─────────────┘                └────┬─────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
               ┌────▼────┐    ┌────▼────┐    ┌─────▼─────┐
               │Frontend │    │  API    │    │ WebSocket │
               │ :3200   │    │ :8200   │    │   /ws/    │
               └─────────┘    └────┬────┘    └───────────┘
                                   │
                          ┌────────┼────────┐
                          │        │        │
                    ┌─────▼──┐ ┌───▼───┐ ┌──▼───┐
                    │Postgres│ │ Redis │ │Upload│
                    │ :5437  │ │ :6382 │ │ Dir  │
                    └────────┘ └───┬───┘ └──────┘
                                   │
                              ┌────▼────┐
                              │ Worker  │──► WhisperX (GPU)
                              │  (GPU)  │──► Ollama LLM
                              └─────────┘
```

## 프로젝트 구조

```
voice-recognition/
├── backend/                # FastAPI 백엔드
│   └── app/
│       ├── api/routes/     # API 엔드포인트 (auth, notes, projects, chat, search, ws)
│       ├── core/           # 설정, 보안 (JWT)
│       ├── models/         # SQLAlchemy 모델
│       └── services/       # 비즈니스 로직 (DB, Redis 큐)
├── frontend/               # Next.js 프론트엔드
│   └── src/
│       ├── app/            # 페이지 (dashboard, upload, notes/[id], login)
│       ├── components/     # UI 컴포넌트 (AudioPlayer, AudioRecorder, FileUploader, ...)
│       ├── hooks/          # 커스텀 훅 (useWebSocket, useAudioRecorder)
│       ├── lib/            # API 클라이언트 (axios)
│       └── stores/         # zustand 상태 관리
├── worker/                 # AI 처리 워커 (GPU)
│   └── app/
│       └── pipelines/      # STT (WhisperX), AI 분석 (Ollama)
├── docker/                 # Docker 초기화 설정 (postgres, redis)
├── scripts/                # 배포, NVIDIA 설정 스크립트
├── uploads/                # 업로드된 오디오 파일 저장소
└── docker-compose.yml      # 전체 서비스 오케스트레이션
```

## 빠른 시작

### 사전 요구사항

- Docker Engine 27+, Docker Compose v2
- NVIDIA GPU + NVIDIA Container Toolkit (Worker용)
- Ollama (호스트에 설치, llama3.2:3b 모델)

### 1. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일 편집: SECRET_KEY, POSTGRES_PASSWORD 등 변경
```

주요 환경 변수:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `POSTGRES_DB` | `voice_recognition` | DB 이름 |
| `POSTGRES_USER` | `voice` | DB 사용자 |
| `POSTGRES_PASSWORD` | `voice_secret` | DB 비밀번호 |
| `POSTGRES_PORT` | `5437` | PostgreSQL 외부 포트 |
| `REDIS_PORT` | `6382` | Redis 외부 포트 |
| `SECRET_KEY` | `dev-secret-key...` | JWT 서명 키 |
| `OLLAMA_URL` | `http://host.docker.internal:11434` | Ollama API URL |
| `HF_TOKEN` | - | HuggingFace 토큰 (화자 분리용) |

### 2. 서비스 실행

```bash
# DB + Redis + API + Frontend (GPU 불필요)
docker compose up -d voice-postgres voice-redis voice-api voice-frontend

# GPU Worker (NVIDIA Container Toolkit 필요)
docker compose up -d voice-worker
```

### 3. 접속

- **프론트엔드**: http://localhost:3200
- **API**: http://localhost:8200
- **헬스체크**: http://localhost:8200/health

## 배포 (운영 서버)

```bash
# rsync 기반 배포 스크립트
./scripts/deploy.sh
```

NVIDIA Container Toolkit이 미설치인 경우:
```bash
# 운영 서버에서 실행
sudo bash scripts/setup-nvidia-toolkit.sh
docker compose up -d voice-worker
```

## API 레퍼런스

### 인증

JWT Bearer 토큰 인증. 토큰 유효기간 24시간.

```bash
# 회원가입
POST /api/auth/register  {"email", "name", "password"}

# 로그인 → 토큰 발급
POST /api/auth/login     {"email", "password"}
# → {"access_token": "eyJ...", "token_type": "bearer"}
```

이후 모든 요청에 `Authorization: Bearer <token>` 헤더 포함.

### 핵심 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/projects` | 프로젝트 생성 |
| `GET` | `/api/projects` | 프로젝트 목록 |
| `POST` | `/api/notes/upload?project_id=&title=` | 오디오 업로드 (multipart) |
| `GET` | `/api/notes/{id}` | 노트 상세 (상태 확인) |
| `GET` | `/api/notes/{id}/transcript` | 전사 텍스트 + 화자 분리 |
| `GET` | `/api/notes/{id}/analysis` | AI 분석 (요약, 주제, 키워드, 액션 아이템) |
| `POST` | `/api/notes/{id}/chat` | AI 채팅 (녹음 내용 기반 Q&A) |
| `GET` | `/api/search?q=` | 전문 검색 |
| `WS` | `/ws/notes/{id}/status` | 처리 상태 실시간 WebSocket |

### 지원 오디오 형식

`.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg`, `.flac` (최대 500MB)

### 처리 파이프라인

```
업로드 → queued → processing (STT) → analyzing (AI 요약) → completed
                                                          → failed
```

## 외부 연동 예시

```python
import httpx

BASE = "https://voice.krdn.kr"

# 로그인
token = httpx.post(f"{BASE}/api/auth/login", json={
    "email": "user@example.com", "password": "password"
}).json()["access_token"]

headers = {"Authorization": f"Bearer {token}"}

# 오디오 업로드
with open("meeting.mp3", "rb") as f:
    note = httpx.post(
        f"{BASE}/api/notes/upload",
        params={"project_id": "...", "title": "회의"},
        files={"file": ("meeting.mp3", f, "audio/mpeg")},
        headers=headers, timeout=60.0,
    ).json()

# 완료 대기 후 결과 조회
analysis = httpx.get(f"{BASE}/api/notes/{note['id']}/analysis", headers=headers).json()
print(analysis["summary"])
```

## 포트 구성

| 서비스 | 포트 | 설명 |
|--------|------|------|
| voice-frontend | 3200 | Next.js 프론트엔드 |
| voice-api | 8200 | FastAPI 백엔드 |
| voice-postgres | 5437 | PostgreSQL 16 |
| voice-redis | 6382 | Redis 7 |
| Ollama (호스트) | 11434 | LLM 서비스 |

## 알려진 이슈

- `bcrypt` 5.x와 `passlib` 비호환 → `bcrypt==4.0.1`로 고정
- `HF_TOKEN` 미설정 시 화자 분리 기능 비활성화
- 브라우저 녹음은 HTTPS 환경에서만 동작 (브라우저 보안 정책)

## 라이선스

[BSD 3-Clause License](LICENSE) - Copyright (c) 2026, Gon Kim
