"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface Note {
  id: string;
  project_id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  language: string | null;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const { data } = await api.get("/api/projects");
      setProjects(data);
    } catch {
      /* 무시 */
    }
  }, []);

  const fetchNotes = useCallback(async (projectId?: string) => {
    try {
      const url = projectId
        ? `/api/search?q=&project_id=${projectId}`
        : "/api/search?q=";
      const { data } = await api.get(url);
      setNotes(data);
    } catch {
      /* 무시 */
    }
  }, []);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    fetchProjects();
    fetchNotes();
  }, [token, router, fetchProjects, fetchNotes]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/projects", {
        name: newProjectName,
        description: newProjectDesc || null,
      });
      setNewProjectName("");
      setNewProjectDesc("");
      setShowNewProject(false);
      fetchProjects();
    } catch {
      /* 무시 */
    }
  };

  const handleProjectSelect = (projectId: string | null) => {
    setSelectedProject(projectId);
    if (projectId) {
      fetchNotes(projectId);
    } else {
      fetchNotes();
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
      processing: "bg-blue-400/10 text-blue-400 border-blue-400/20",
      completed: "bg-green-400/10 text-green-400 border-green-400/20",
      failed: "bg-red-400/10 text-red-400 border-red-400/20",
    };
    const labels: Record<string, string> = {
      pending: "대기",
      processing: "처리 중",
      completed: "완료",
      failed: "실패",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.pending}`}
      >
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="min-h-screen">
      {/* 상단 네비게이션 */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <span className="text-lg font-bold text-white">
                Voice Recognition
              </span>
            </div>

            <div className="flex items-center gap-4">
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-violet-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-violet-700 transition"
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
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                업로드
              </Link>
              <button
                onClick={logout}
                className="text-sm text-gray-400 hover:text-white transition"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* 사이드바: 프로젝트 목록 */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">프로젝트</h2>
              <button
                onClick={() => setShowNewProject(!showNewProject)}
                className="text-gray-400 hover:text-blue-400 transition"
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
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </button>
            </div>

            {showNewProject && (
              <form
                onSubmit={handleCreateProject}
                className="mb-4 p-3 bg-gray-900 border border-gray-800 rounded-xl space-y-3"
              >
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="프로젝트 이름"
                  required
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="설명 (선택)"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                  만들기
                </button>
              </form>
            )}

            <div className="space-y-1">
              <button
                onClick={() => handleProjectSelect(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                  selectedProject === null
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:bg-gray-900 hover:text-white"
                }`}
              >
                전체 노트
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProjectSelect(p.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    selectedProject === p.id
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:bg-gray-900 hover:text-white"
                  }`}
                >
                  <div className="font-medium">{p.name}</div>
                  {p.description && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {p.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 메인: 노트 목록 */}
          <div className="lg:col-span-3">
            <h2 className="text-lg font-semibold text-white mb-4">
              {selectedProject
                ? projects.find((p) => p.id === selectedProject)?.name
                : "최근 노트"}
            </h2>

            {notes.length === 0 ? (
              <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-2xl">
                <svg
                  className="w-12 h-12 text-gray-600 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
                <p className="text-gray-400 mb-4">아직 노트가 없습니다.</p>
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                  첫 번째 음성 파일 업로드
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className="block p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium group-hover:text-blue-400 transition truncate">
                          {note.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span>
                            {new Date(note.created_at).toLocaleDateString(
                              "ko-KR",
                            )}
                          </span>
                          <span>{formatDuration(note.duration_seconds)}</span>
                          {note.language && <span>{note.language}</span>}
                        </div>
                      </div>
                      <div className="ml-4">{statusBadge(note.status)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
