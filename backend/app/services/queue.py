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
