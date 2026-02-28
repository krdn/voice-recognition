# worker/app/pipelines/analysis.py
import json
import logging

import httpx

from app.config import settings

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

    try:
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
    except httpx.HTTPError as e:
        logger.error(f"Ollama 연결 오류: {e}")
        return _empty_result()

    if resp.status_code != 200:
        logger.error(f"Ollama 응답 오류: {resp.status_code}")
        return _empty_result()

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
        return _empty_result()


def _empty_result() -> dict:
    return {"summary": None, "topics": [], "keywords": [], "action_items": []}
