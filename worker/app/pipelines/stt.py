# worker/app/pipelines/stt.py
import gc
import logging

import torch
import whisperx

from app.config import settings

logger = logging.getLogger(__name__)


def transcribe_audio(audio_path: str) -> dict:
    """WhisperX로 음성을 텍스트로 변환 + 화자 분리

    GPU 메모리 관리를 위해 각 단계 후 모델을 해제합니다.
    RTX 3060 6GB VRAM 기준으로 최적화되어 있습니다.
    """
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = settings.whisper_compute_type if device == "cuda" else "int8"

    logger.info(f"STT 시작: {audio_path} (device={device})")

    # Step 1: 음성 인식 (Whisper)
    model = whisperx.load_model(
        settings.whisper_model,
        device,
        compute_type=compute_type,
    )
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio, batch_size=settings.whisper_batch_size)
    detected_language = result["language"]
    logger.info(f"언어 감지: {detected_language}")

    # GPU 메모리 해제
    del model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()

    # Step 2: 단어 정렬 (Alignment)
    model_a, metadata = whisperx.load_align_model(
        language_code=detected_language,
        device=device,
    )
    result = whisperx.align(result["segments"], model_a, metadata, audio, device)

    del model_a
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()

    # Step 3: 화자 분리 (Diarization) - HF 토큰이 있을 때만
    if settings.hf_token:
        from whisperx.diarize import DiarizationPipeline

        diarize_model = DiarizationPipeline(
            use_auth_token=settings.hf_token,
            device=device,
        )
        diarize_segments = diarize_model(audio)
        result = whisperx.assign_word_speakers(diarize_segments, result)

        del diarize_model
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()

    # 결과 구성
    segments = []
    for seg in result["segments"]:
        segments.append({
            "speaker": seg.get("speaker", "SPEAKER_00"),
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip(),
            "confidence": round(seg.get("score", 0.0), 3) if "score" in seg else None,
        })

    full_text = " ".join(s["text"] for s in segments)

    return {
        "segments": segments,
        "full_text": full_text,
        "language": detected_language,
    }
