"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import AudioPlayer from "@/components/AudioPlayer";
import TranscriptView from "@/components/TranscriptView";
import AnalysisPanel from "@/components/AnalysisPanel";
import ChatSidebar from "@/components/ChatSidebar";

interface Note {
  id: string;
  project_id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  language: string | null;
  file_path: string;
}

interface Segment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

interface Transcript {
  segments: Segment[];
  full_text: string;
}

interface Analysis {
  summary: string | null;
  topics: string[];
  keywords: string[];
  action_items: (string | { text: string; assignee?: string | null; deadline?: string | null })[];
}

type Tab = "transcript" | "analysis";

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const noteId = params.id as string;

  const [note, setNote] = useState<Note | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("transcript");
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [noteRes, transcriptRes, analysisRes] = await Promise.allSettled([
        api.get(`/api/notes/${noteId}`),
        api.get(`/api/notes/${noteId}/transcript`),
        api.get(`/api/notes/${noteId}/analysis`),
      ]);

      if (noteRes.status === "fulfilled") setNote(noteRes.value.data);
      if (transcriptRes.status === "fulfilled")
        setTranscript(transcriptRes.value.data);
      if (analysisRes.status === "fulfilled")
        setAnalysis(analysisRes.value.data);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    fetchData();
  }, [token, router, fetchData]);

  const handleSeek = (time: number) => {
    setSeekTo(time);
    // seekTo를 리셋하여 같은 시간으로 다시 클릭 가능
    setTimeout(() => setSeekTo(null), 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-gray-400">노트를 찾을 수 없습니다.</p>
        <Link href="/dashboard" className="text-blue-400 hover:underline">
          대시보드로 돌아가기
        </Link>
      </div>
    );
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8200";
  const audioUrl = `${API_URL}/uploads/${note.file_path?.split("/").pop() || ""}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* 상단 바 */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-gray-400 hover:text-white transition"
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
                    d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                  />
                </svg>
              </Link>
              <h1 className="text-white font-semibold truncate max-w-md">
                {note.title}
              </h1>
            </div>

            <button
              onClick={() => setShowChat(!showChat)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
                showChat
                  ? "bg-violet-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
              AI 채팅
            </button>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* 메인 컨텐츠 */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* 오디오 플레이어 */}
            {note.file_path && (
              <AudioPlayer
                audioUrl={audioUrl}
                onTimeUpdate={setCurrentTime}
                seekTo={seekTo}
              />
            )}

            {/* 탭 */}
            <div className="flex gap-1 bg-gray-900 p-1 rounded-lg w-fit">
              <button
                onClick={() => setActiveTab("transcript")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === "transcript"
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                전문 (Transcript)
              </button>
              <button
                onClick={() => setActiveTab("analysis")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === "analysis"
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                AI 분석
              </button>
            </div>

            {/* 탭 콘텐츠 */}
            {activeTab === "transcript" && transcript ? (
              <TranscriptView
                segments={transcript.segments}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            ) : activeTab === "transcript" ? (
              <div className="text-center py-12 text-gray-500">
                {note.status === "completed"
                  ? "전문(transcript)이 없습니다."
                  : "음성 인식 처리 중입니다..."}
              </div>
            ) : null}

            {activeTab === "analysis" && analysis ? (
              <AnalysisPanel
                summary={analysis.summary}
                topics={analysis.topics || []}
                keywords={analysis.keywords || []}
                actionItems={analysis.action_items || []}
              />
            ) : activeTab === "analysis" ? (
              <div className="text-center py-12 text-gray-500">
                {note.status === "completed"
                  ? "분석 결과가 없습니다."
                  : "AI 분석 처리 중입니다..."}
              </div>
            ) : null}
          </div>
        </div>

        {/* 채팅 사이드바 */}
        {showChat && (
          <div className="w-96 border-l border-gray-800 bg-gray-950 flex-shrink-0 hidden lg:flex lg:flex-col">
            <ChatSidebar noteId={noteId} />
          </div>
        )}
      </div>
    </div>
  );
}
