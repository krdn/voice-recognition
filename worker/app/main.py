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

# blpop 은 서버가 이 시간만큼 블록한 뒤 nil 을 돌려준다.
BLPOP_TIMEOUT_SEC = 5
# ⚠️ socket_timeout 은 반드시 BLPOP_TIMEOUT_SEC 보다 커야 한다.
#
# redis-py 8.0.1 은 socket_timeout 이 None 이어도 블로킹 명령의 타임아웃을 소켓 읽기
# 마감으로 쓴다. 그러면 서버가 nil 을 돌려주는 순간과 클라이언트의 마감이 정확히 겹쳐
# 매번 클라이언트가 먼저 끊고 TimeoutError 를 던진다. 큐가 비어 있는 한 100% 재현되며
# 그때마다 워커가 죽어 재시작 루프가 된다 (운영에서 RestartCount 1027 관측).
#
# 같은 이미지·같은 네트워크 실측:
#   기본(socket_timeout 미지정) → 5.01초에 TimeoutError
#   socket_timeout=6            → 정상 (5.03초에 None 반환)
#   socket_timeout=10           → 정상
SOCKET_TIMEOUT_SEC = BLPOP_TIMEOUT_SEC + 5


async def publish_status(r: redis.Redis, note_id: str, status: str, progress: int = 0):
    """Redis PubSub으로 진행 상태 발행"""
    msg = json.dumps({"note_id": note_id, "status": status, "progress": progress})
    await r.publish(f"voice:status:{note_id}", msg)


def update_note_status(note_id: str, status: str):
    """노트 상태 업데이트 SQL"""
    return text("UPDATE notes SET status = :status WHERE id = CAST(:note_id AS uuid)").bindparams(
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
                    VALUES (gen_random_uuid(), CAST(:note_id AS uuid), :segments, :full_text,
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
                    WHERE id = CAST(:note_id AS uuid)
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
                    VALUES (gen_random_uuid(), CAST(:note_id AS uuid), :summary, :topics, :keywords, :action_items, now(), now())
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
                text("UPDATE notes SET status = 'completed' WHERE id = CAST(:note_id AS uuid)"),
                {"note_id": note_id},
            )
            await db.commit()

        await publish_status(r, note_id, "completed", 100)
        logger.info(f"작업 완료: note_id={note_id}")

    except Exception as e:
        logger.error(f"작업 실패: note_id={note_id}, error={e}")
        async with async_session() as db:
            await db.execute(
                text("UPDATE notes SET status = 'failed' WHERE id = CAST(:note_id AS uuid)"),
                {"note_id": note_id},
            )
            await db.commit()
        await publish_status(r, note_id, "failed", 0)


async def main():
    """AI 워커 메인 루프: Redis 큐에서 작업을 꺼내 처리"""
    logger.info("AI 워커 시작...")
    r = redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_timeout=SOCKET_TIMEOUT_SEC,
    )

    while True:
        # 블로킹 팝 — 타임아웃은 상수로 묶는다. 여기 숫자를 바꾸면 socket_timeout 과의
        # 관계가 깨져 위 주석의 재시작 루프가 그대로 재현된다.
        result = await r.blpop(QUEUE_NAME, timeout=BLPOP_TIMEOUT_SEC)
        if result:
            _, job_json = result
            job_data = json.loads(job_json)
            await process_job(r, job_data)


if __name__ == "__main__":
    asyncio.run(main())
