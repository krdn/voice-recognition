# backend/app/api/routes/ws.py
import asyncio

import redis.asyncio as redis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

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
