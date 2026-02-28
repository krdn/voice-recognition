# backend/app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.notes import router as notes_router
from app.api.routes.projects import router as projects_router
from app.api.routes.search import router as search_router
from app.api.routes.service import router as service_router
from app.api.routes.ws import router as ws_router
from app.core.database import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB 연결 확인
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

# 라우터 등록
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(notes_router)
app.include_router(chat_router)
app.include_router(search_router)
app.include_router(service_router)
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
