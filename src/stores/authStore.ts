import { create } from 'zustand';
import * as authApi from '@/api/auth';
import { getStoredTokens, storeTokens, clearTokens } from '@/api/client';
import type { Profile, Author } from '@/api/types';

interface AuthState {
  account: Profile | null;
  author: Author | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** Initialize auth from stored tokens on app mount */
  init: () => Promise<void>;

  /** Request email code */
  requestCode: (email: string) => Promise<void>;

  /** Login with email + code, fetch profile */
  login: (email: string, code: string) => Promise<Profile>;

  /** Logout and clear tokens */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  account: null,
  author: null,
  isAuthenticated: false,
  isLoading: true,

  init: async () => {
    const { accessToken, refreshToken } = getStoredTokens();
    if (!accessToken || !refreshToken) {
      set({ isLoading: false });
      return;
    }

    try {
      const profile = await authApi.getProfile();
      set({
        account: profile,
        author: profile.author ?? null,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // Access token may be expired — try refresh
      try {
        const creds = await authApi.refreshToken(refreshToken);
        storeTokens(creds.accessToken, creds.refreshToken);
        const profile = await authApi.getProfile();
        set({
          account: profile,
          author: profile.author ?? null,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        clearTokens();
        set({ account: null, author: null, isAuthenticated: false, isLoading: false });
      }
    }
  },

  requestCode: async (email: string) => {
    await authApi.requestCode(email);
  },

  login: async (email: string, code: string) => {
    const creds = await authApi.login(email, code);
    storeTokens(creds.accessToken, creds.refreshToken);

    const profile = await authApi.getProfile();
    set({
      account: profile,
      author: profile.author ?? null,
      isAuthenticated: true,
    });
    return profile;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore — clear local state regardless
    }
    clearTokens();
    set({ account: null, author: null, isAuthenticated: false });
  },
}));
