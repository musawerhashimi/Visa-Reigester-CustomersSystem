import { create } from "zustand";

import { api, tokenStore } from "@/lib/api";
import type { User } from "@/types/domain";

interface AuthState {
  user: User | null;
  /** True until the initial session probe finishes, so guards don't flash. */
  initializing: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  loadSession: () => Promise<void>;
  hasPermission: (slug: string) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  initializing: true,

  async login(email, password) {
    const { data } = await api.post<{
      access: string;
      refresh: string;
      user: User;
    }>("/auth/login/", { email, password });

    tokenStore.set(data.access, data.refresh);
    set({ user: data.user, initializing: false });
    return data.user;
  },

  logout() {
    tokenStore.clear();
    set({ user: null });
  },

  async loadSession() {
    if (!tokenStore.access) {
      set({ user: null, initializing: false });
      return;
    }
    try {
      const { data } = await api.get<User>("/auth/me/");
      set({ user: data, initializing: false });
    } catch {
      // An unusable token is worse than none: clear it so guards redirect
      // cleanly instead of retrying a doomed request on every page.
      tokenStore.clear();
      set({ user: null, initializing: false });
    }
  },

  hasPermission(slug) {
    const { user } = get();
    if (!user) return false;
    if (user.role === "super_admin") return true;
    return user.permissions.includes(slug);
  },
}));
