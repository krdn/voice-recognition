"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface WSMessage {
  note_id: string;
  status: string;
  progress: number;
}

interface UseWebSocketOptions {
  noteId: string | null;
  enabled?: boolean;
}

export function useWebSocket({ noteId, enabled = true }: UseWebSocketOptions) {
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!noteId || !enabled) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const port = process.env.NEXT_PUBLIC_API_PORT || "8200";
    const ws = new WebSocket(`${protocol}//${host}:${port}/ws/notes/${noteId}/status`);

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data);
        setStatus(data.status);
        setProgress(data.progress);
      } catch {
        /* 무시 */
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    wsRef.current = ws;
  }, [noteId, enabled]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  return { status, progress, isConnected, disconnect };
}
