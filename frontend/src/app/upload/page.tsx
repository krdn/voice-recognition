"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import FileUploader from "@/components/FileUploader";
import AudioRecorder from "@/components/AudioRecorder";
import { useWebSocket } from "@/hooks/useWebSocket";

type InputTab = "file" | "record";

interface Project {
  id: string;
  name: string;
}

export default function UploadPage() {
  const router = useRouter();
  const token = useAuth((s) => s.token);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedNoteId, setUploadedNoteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [activeTab, setActiveTab] = useState<InputTab>("file");

  const { status, progress } = useWebSocket({
    noteId: uploadedNoteId,
    enabled: !!uploadedNoteId,
  });

  const fetchProjects = useCallback(async () => {
    try {
      const { data } = await api.get("/api/projects");
      setProjects(data);
      if (data.length > 0) {
        setSelectedProject(data[0].id);
      } else {
        setShowNewProject(true);
      }
    } catch {
      /* 무시 */
    }
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setIsCreatingProject(true);
    try {
      const { data } = await api.post("/api/projects", {
        name: newProjectName.trim(),
      });
      setProjects((prev) => [...prev, data]);
      setSelectedProject(data.id);
      setNewProjectName("");
      setShowNewProject(false);
    } catch {
      setError("프로젝트 생성에 실패했습니다.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    fetchProjects();
  }, [token, router, fetchProjects]);

  // 처리 완료 시 노트 상세 페이지로 이동
  useEffect(() => {
    if (status === "completed" && uploadedNoteId) {
      router.push(`/notes/${uploadedNoteId}`);
    }
  }, [status, uploadedNoteId, router]);

  const handleFileSelect = (f: File) => {
    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleRecordingComplete = (f: File) => {
    setFile(f);
    if (!title) {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      setTitle(
        `녹음 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      );
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedProject || !title.trim()) return;

    setIsUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const params = new URLSearchParams({
        project_id: selectedProject,
        title: title.trim(),
      });

      const { data } = await api.post(`/api/notes/upload?${params}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setUploadedNoteId(data.id);
    } catch {
      setError("업로드에 실패했습니다. 다시 시도해주세요.");
      setIsUploading(false);
    }
  };

  const statusLabels: Record<string, string> = {
    pending: "대기 중",
    transcribing: "음성 인식 중",
    diarizing: "화자 분리 중",
    analyzing: "AI 분석 중",
    completed: "완료",
    failed: "실패",
  };

  return (
    <div className="min-h-screen">
      {/* 상단 네비게이션 */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-14 gap-3">
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
            <h1 className="text-white font-semibold">음성 업로드</h1>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {uploadedNoteId ? (
          /* 처리 진행 상태 */
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-blue-500/10 rounded-2xl flex items-center justify-center">
              <svg
                className="w-8 h-8 text-blue-400 animate-pulse"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                />
              </svg>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white">
                {status === "failed" ? "처리 실패" : "AI 처리 중..."}
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                {statusLabels[status || "pending"] || status}
              </p>
            </div>

            {/* 프로그레스 바 */}
            <div className="max-w-sm mx-auto">
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    status === "failed" ? "bg-red-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.max(progress, 5)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {Math.round(progress)}%
              </p>
            </div>

            {status === "failed" && (
              <Link
                href="/upload"
                onClick={() => {
                  setUploadedNoteId(null);
                  setFile(null);
                  setIsUploading(false);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 transition"
              >
                다시 시도
              </Link>
            )}
          </div>
        ) : (
          /* 업로드 폼 */
          <form onSubmit={handleUpload} className="space-y-6">
            {/* 입력 방식 탭 */}
            <div className="flex gap-1 p-1 bg-gray-900 border border-gray-800 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab("file")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition ${
                  activeTab === "file"
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-gray-300"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
                파일 업로드
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("record")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition ${
                  activeTab === "record"
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-gray-300"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
                녹음
              </button>
            </div>

            {activeTab === "file" ? (
              <FileUploader onFileSelect={handleFileSelect} />
            ) : (
              <AudioRecorder onRecordingComplete={handleRecordingComplete} />
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  제목
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="노트 제목을 입력하세요"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  프로젝트
                </label>
                {showNewProject ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="새 프로젝트 이름"
                      className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={handleCreateProject}
                      disabled={!newProjectName.trim() || isCreatingProject}
                      className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {isCreatingProject ? "..." : "만들기"}
                    </button>
                    {projects.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowNewProject(false)}
                        className="px-3 py-2.5 text-gray-400 hover:text-white transition"
                      >
                        취소
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      required
                      className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    >
                      <option value="">프로젝트 선택</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewProject(true)}
                      className="px-3 py-2.5 text-gray-400 hover:text-blue-400 transition"
                      title="새 프로젝트"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!file || !selectedProject || !title.trim() || isUploading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-violet-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-950 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                  업로드 중...
                </span>
              ) : (
                "업로드 시작"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
