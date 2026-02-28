"use client";

import { useRef, useEffect } from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

interface AudioRecorderProps {
  onRecordingComplete: (file: File) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function AudioRecorder({ onRecordingComplete }: AudioRecorderProps) {
  const {
    status,
    duration,
    audioBlob,
    audioUrl,
    error,
    start,
    stop,
    pause,
    resume,
    reset,
  } = useAudioRecorder();

  const audioRef = useRef<HTMLAudioElement>(null);

  // 녹음 완료 후 File로 변환하여 콜백 호출
  const handleConfirm = () => {
    if (!audioBlob) return;
    const now = new Date();
    const dateStr = now.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).replace(/\. /g, "-").replace(".", "").replace(" ", "_");
    const fileName = `녹음_${dateStr}.webm`;
    const file = new File([audioBlob], fileName, { type: audioBlob.type });
    onRecordingComplete(file);
  };

  // 상태에 따른 pulse 애니메이션 정리
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // 녹음 완료 후 미리듣기 UI
  if (audioBlob && audioUrl) {
    return (
      <div className="border-2 border-dashed border-green-500/30 bg-green-500/5 rounded-2xl p-8 text-center space-y-5">
        <div className="w-14 h-14 mx-auto bg-green-500/10 rounded-2xl flex items-center justify-center">
          <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div>
          <p className="text-white font-medium">녹음 완료</p>
          <p className="text-sm text-gray-400 mt-1">{formatTime(duration)}</p>
        </div>

        {/* 미리듣기 */}
        <audio ref={audioRef} src={audioUrl} controls className="mx-auto max-w-full" />

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-600 transition"
          >
            재녹음
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            이 녹음 사용
          </button>
        </div>
      </div>
    );
  }

  // 녹음 중 / 대기 UI
  return (
    <div className="border-2 border-dashed border-gray-700 bg-gray-900 rounded-2xl p-8 text-center space-y-5">
      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* 녹음 시간 표시 */}
      <div className="space-y-2">
        <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${
          status === "recording"
            ? "bg-red-500/10"
            : status === "paused"
              ? "bg-yellow-500/10"
              : "bg-gray-800"
        }`}>
          {status === "recording" ? (
            <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
          ) : (
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          )}
        </div>

        {status !== "idle" && (
          <p className="text-2xl font-mono text-white">{formatTime(duration)}</p>
        )}

        {status === "idle" && (
          <div>
            <p className="text-white font-medium">마이크로 녹음하세요</p>
            <p className="text-sm text-gray-400 mt-1">버튼을 눌러 녹음을 시작합니다</p>
          </div>
        )}
        {status === "paused" && (
          <p className="text-sm text-yellow-400">일시정지</p>
        )}
      </div>

      {/* 녹음 컨트롤 버튼 */}
      <div className="flex items-center justify-center gap-3">
        {status === "idle" && (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" />
            </svg>
            녹음 시작
          </button>
        )}

        {status === "recording" && (
          <>
            <button
              type="button"
              onClick={pause}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 border border-gray-700 rounded-xl hover:border-gray-600 hover:text-white transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              일시정지
            </button>
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white text-sm font-medium rounded-xl hover:bg-gray-600 transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              정지
            </button>
          </>
        )}

        {status === "paused" && (
          <>
            <button
              type="button"
              onClick={resume}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 border border-gray-700 rounded-xl hover:border-gray-600 hover:text-white transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              계속
            </button>
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white text-sm font-medium rounded-xl hover:bg-gray-600 transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              정지
            </button>
          </>
        )}
      </div>
    </div>
  );
}
