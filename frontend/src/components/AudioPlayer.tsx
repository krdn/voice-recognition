"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface AudioPlayerProps {
  audioUrl: string;
  onTimeUpdate?: (time: number) => void;
  seekTo?: number | null;
}

export default function AudioPlayer({
  audioUrl,
  onTimeUpdate,
  seekTo,
}: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<ReturnType<typeof import("wavesurfer.js").default.create> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    let ws: ReturnType<typeof import("wavesurfer.js").default.create> | null = null;

    const initWaveSurfer = async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;

      if (!containerRef.current) return;

      ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: "#4B5563",
        progressColor: "#3B82F6",
        cursorColor: "#60A5FA",
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 64,
        url: audioUrl,
      });

      ws.on("ready", () => {
        setDuration(ws!.getDuration());
        setIsReady(true);
      });

      ws.on("timeupdate", (time: number) => {
        setCurrentTime(time);
        onTimeUpdate?.(time);
      });

      ws.on("play", () => setIsPlaying(true));
      ws.on("pause", () => setIsPlaying(false));
      ws.on("finish", () => setIsPlaying(false));

      wavesurferRef.current = ws;
    };

    initWaveSurfer();

    return () => {
      ws?.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  const handleSeekTo = useCallback((time: number) => {
    if (wavesurferRef.current && isReady) {
      const d = wavesurferRef.current.getDuration();
      if (d > 0) {
        wavesurferRef.current.seekTo(time / d);
      }
    }
  }, [isReady]);

  useEffect(() => {
    if (seekTo !== null && seekTo !== undefined) {
      handleSeekTo(seekTo);
    }
  }, [seekTo, handleSeekTo]);

  const togglePlay = () => {
    wavesurferRef.current?.playPause();
  };

  const skip = (seconds: number) => {
    if (wavesurferRef.current) {
      const newTime = Math.max(
        0,
        Math.min(currentTime + seconds, duration),
      );
      handleSeekTo(newTime);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      {/* 파형 */}
      <div ref={containerRef} className="mb-4 rounded-lg overflow-hidden" />

      {/* 컨트롤 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-mono w-12">
          {formatTime(currentTime)}
        </span>

        <div className="flex items-center gap-3">
          {/* 10초 뒤로 */}
          <button
            onClick={() => skip(-10)}
            disabled={!isReady}
            className="text-gray-400 hover:text-white transition disabled:opacity-30"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
              />
            </svg>
          </button>

          {/* 재생/일시정지 */}
          <button
            onClick={togglePlay}
            disabled={!isReady}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-30"
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 ml-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* 10초 앞으로 */}
          <button
            onClick={() => skip(10)}
            disabled={!isReady}
            className="text-gray-400 hover:text-white transition disabled:opacity-30"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3"
              />
            </svg>
          </button>
        </div>

        <span className="text-xs text-gray-500 font-mono w-12 text-right">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
