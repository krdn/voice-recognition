# backend/app/api/routes/chat.py
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
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
