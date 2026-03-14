import { create } from 'zustand';
import * as authApi from '@/api/auth';
import * as authorsApi from '@/api/authors';
import { getStoredTokens, storeTokens, clearTokens } from '@/api/client';
import { getServices, getBackend } from '@/services';
import type { Profile, Author } from '@/api/types';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

  /** Connect local device to a crux.garden account (stays local-first) */
  connectAccount: (email: string, code: string) => Promise<Profile>;

  /** Disconnect from crux.garden account */
  disconnectAccount: () => Promise<void>;

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
        // Tokens invalid — silently clear and stay disconnected
        clearTokens();
        set({ account: null, author: null, isAuthenticated: false, isLoading: false });
      }
    }
  },

  connectAccount: async (email: string, code: string) => {
    const creds = await authApi.login(email, code);
    storeTokens(creds.accessToken, creds.refreshToken);

    const profile = await authApi.getProfile();

    // Update local author with API identity if in local mode
    if (getBackend() === 'local' && profile.author) {
      const { author: localAuthor } = useAuthStore.getState();
      if (localAuthor) {
        try {
          await getServices().author.update(localAuthor.id, {
            username: profile.author.username,
            displayName: profile.author.displayName,
          });
        } catch {
          // Non-fatal — local author update failed but connection still works
        }
      }
    }

    set((state) => ({
      account: profile,
      author: profile.author ?? state.author,
      isAuthenticated: true,
    }));
    return profile;
  },

  disconnectAccount: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore — clear local state regardless
    }
    clearTokens();
    set({ account: null, isAuthenticated: false });
    // Keep author as-is — preserves username/displayName from API
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
    let updated: Author;
    if (getBackend() === 'local') {
      updated = await getServices().author.update(author.id, dto);
    } else {
      updated = await authorsApi.update(author.id, dto);
    }
    set({ author: updated });
    return updated;
  },

  uploadAvatar: async (file: File) => {
    const { author } = useAuthStore.getState();
    if (!author) throw new Error('No author');
    if (getBackend() === 'local') {
      const dataUrl = await fileToDataUrl(file);
      const updated = await getServices().author.update(author.id, {
        meta: { ...author.meta, avatarUrl: dataUrl },
      });
      set({ author: updated });
      return updated;
    }
    const updated = await authorsApi.uploadAvatar(author.id, file);
    set({ author: updated });
    return updated;
  },

  removeAvatar: async () => {
    const { author } = useAuthStore.getState();
    if (!author) throw new Error('No author');
    if (getBackend() === 'local') {
      const meta = { ...author.meta, avatarUrl: null };
      const updated = await getServices().author.update(author.id, { meta });
      set({ author: updated });
      return;
    }
    const updated = await authorsApi.removeAvatar(author.id);
    set({ author: updated });
  },
}));
