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
