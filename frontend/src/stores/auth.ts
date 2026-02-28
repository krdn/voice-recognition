import { create } from "zustand";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuth = create<AuthState>((set) => ({
  token:
    typeof window !== "undefined" ? localStorage.getItem("token") : null,
  user: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("token", data.access_token);
      set({ token: data.access_token, isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error("로그인에 실패했습니다.");
    }
  },

  register: async (email, name, password) => {
    set({ isLoading: true });
    try {
      await api.post("/api/auth/register", { email, name, password });
      set({ isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error("회원가입에 실패했습니다.");
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    set({ token: null, user: null });
  },

  setLoading: (loading) => set({ isLoading: loading }),
}));
