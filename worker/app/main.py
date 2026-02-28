# worker/app/main.py
import asyncio
import json
import logging

import redis.asyncio as redis
from sqlalchemy import text

from app.config import settings
from app.pipelines.analysis import analyze_transcript
from app.pipelines.stt import transcribe_audio
from app.services.db import async_session

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

QUEUE_NAME = "voice:jobs"


async def publish_status(r: redis.Redis, note_id: str, status: str, progress: int = 0):
    """Redis PubSub으로 진행 상태 발행"""
    msg = json.dumps({"note_id": note_id, "status": status, "progress": progress})
    await r.publish(f"voice:status:{note_id}", msg)


def update_note_status(note_id: str, status: str):
    """노트 상태 업데이트 SQL"""
    return text("UPDATE notes SET status = :status WHERE id = :note_id::uuid").bindparams(
        status=status, note_id=note_id
    )


async def process_job(r: redis.Redis, job_data: dict):
    """단일 작업 처리: STT → 분석 → DB 저장"""
    note_id = job_data["note_id"]
    audio_path = job_data["audio_path"]

    logger.info(f"작업 시작: note_id={note_id}")

    # 상태 업데이트: processing
    async with async_session() as db:
        await db.execute(update_note_status(note_id, "processing"))
        await db.commit()

    try:
        # Step 1: STT + 화자 분리
        await publish_status(r, note_id, "stt", 10)
        stt_result = transcribe_audio(audio_path)
        await publish_status(r, note_id, "stt_done", 50)

        # Step 2: DB에 트랜스크립트 저장
        async with async_session() as db:
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

            # 노트 언어 업데이트 + 상태 변경
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
            await db.execute(
                text("UPDATE notes SET status = 'failed' WHERE id = :note_id::uuid"),
                {"note_id": note_id},
            )
            await db.commit()
        await publish_status(r, note_id, "failed", 0)


async def main():
    """AI 워커 메인 루프: Redis 큐에서 작업을 꺼내 처리"""
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
