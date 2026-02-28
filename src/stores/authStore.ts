import { create } from 'zustand';
import * as authApi from '@/api/auth';
import * as authorsApi from '@/api/authors';
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

  /** Update author fields (username, displayName, etc.) */
  updateAuthor: (dto: { username?: string; displayName?: string; bio?: string }) => Promise<Author>;

  /** Upload avatar and update local author */
  uploadAvatar: (file: File) => Promise<Author>;

  /** Remove avatar */
  removeAvatar: () => Promise<void>;
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

  updateAuthor: async (dto) => {
    const { author } = useAuthStore.getState();
    if (!author) throw new Error('No author');
    const updated = await authorsApi.update(author.id, dto);
    set({ author: updated });
    return updated;
  },

  uploadAvatar: async (file: File) => {
    const { author } = useAuthStore.getState();
    if (!author) throw new Error('No author');
    const updated = await authorsApi.uploadAvatar(author.id, file);
    set({ author: updated });
    return updated;
  },

  removeAvatar: async () => {
    const { author } = useAuthStore.getState();
    if (!author) throw new Error('No author');
    const updated = await authorsApi.removeAvatar(author.id);
    set({ author: updated });
  },
}));
