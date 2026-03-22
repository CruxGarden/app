import { create } from 'zustand';
import * as authApi from '@/api/auth';
import * as authorsApi from '@/api/authors';
import { getStoredTokens, storeTokens, clearTokens } from '@/api/client';
// Lazy import to avoid pulling SQLite worker into public pages
async function lazyGetServices() {
  const { getServices } = await import('@/services');
  return getServices();
}
import type { Profile, Author } from '@/api/types';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Reconcile local author ID with API author ID.
 * Updates the author row and all references (cruxes, artifacts, dimensions).
 */
async function reconcileAuthorId(
  oldId: string,
  apiAuthor: Author,
  accountId: string,
): Promise<Author> {
  try {
    const db = (await import('@/services/sqlite/client')).getSqliteClient();
    const newId = apiAuthor.id;

    await db.run('UPDATE cruxes SET author_id = ? WHERE author_id = ?', [newId, oldId]);
    await db.run('UPDATE artifacts SET author_id = ? WHERE author_id = ?', [newId, oldId]);
    await db.run('UPDATE dimensions SET author_id = ? WHERE author_id = ?', [newId, oldId]);
    // Keep local username and display_name (source of truth), only update id and account_id
    await db.run(
      'UPDATE authors SET id = ?, account_id = ?, updated = ? WHERE id = ?',
      [newId, accountId, new Date().toISOString(), oldId],
    );
    await db.run(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('cruxgarden:localAuthorId', ?)",
      [newId],
    );

    // Return the reconciled local author
    const { getServices: gs } = await import('@/services');
    return gs().author.findById(newId);
  } catch {
    // Non-fatal — return API author as fallback
    return apiAuthor;
  }
}

/**
 * Sync local author data to the API (username, displayName, bio, avatar).
 * Runs in the background — failures are non-fatal.
 */
async function syncAuthorToApi(author: Author): Promise<void> {
  try {
    // Sync profile fields
    await authorsApi.update(author.id, {
      username: author.username,
      displayName: author.displayName,
      bio: author.bio,
    });

    // Sync avatar if it's a local data URL
    const avatarUrl = author.meta?.avatarUrl;
    if (typeof avatarUrl === 'string' && avatarUrl.startsWith('data:')) {
      const res = await fetch(avatarUrl);
      const blob = await res.blob();
      const file = new File([blob], 'avatar', { type: blob.type });
      await authorsApi.uploadAvatar(author.id, file);
    }
  } catch {
    // Non-fatal — will retry on next sync opportunity
  }
}

/**
 * Resolve an author's avatar URL for display.
 * Local authors use data URLs; API authors use relative paths.
 */
export function resolveAvatarUrl(
  author: { meta?: Record<string, unknown>; updated?: string } | null,
): string | null {
  const url = author?.meta?.avatarUrl || author?.meta?.avatar_url;
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:') || url.startsWith('http')) return url;
  // API-relative path (for public pages viewing other authors)
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return `${base}${url}?v=${author?.updated || ''}`;
}

interface AuthState {
  account: Profile | null;
  author: Author | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** Initialize auth from stored tokens on app mount.
   *  Pass { lightweight: true } on public pages to skip SQLite/services init. */
  init: (opts?: { lightweight?: boolean }) => Promise<void>;

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

  init: async (opts) => {
    // Load local author unless lightweight mode (public pages skip SQLite)
    let localAuthor: Author | null = null;
    if (!opts?.lightweight) {
      try {
        const { ensureLocalAuthor } = await import('@/services');
        localAuthor = await ensureLocalAuthor();
      } catch {
        // Services not ready yet — will be set later
      }
    }

    const { accessToken, refreshToken } = getStoredTokens();
    if (!accessToken || !refreshToken) {
      set({ author: localAuthor, isLoading: false });
      return;
    }

    const finalize = async (profile: Profile) => {
      // Reconcile local author ID with API author if mismatched
      if (localAuthor && profile.author && localAuthor.id !== profile.author.id) {
        localAuthor = await reconcileAuthorId(localAuthor.id, profile.author, profile.id);
      }
      // Always prefer local author — never use API author object directly
      set({
        account: profile,
        author: localAuthor,
        isAuthenticated: true,
        isLoading: false,
      });
      if (localAuthor) syncAuthorToApi(localAuthor);
    };

    try {
      const profile = await authApi.getProfile();
      await finalize(profile);
    } catch {
      // Access token may be expired — try refresh
      try {
        const creds = await authApi.refreshToken(refreshToken);
        storeTokens(creds.accessToken, creds.refreshToken);
        const profile = await authApi.getProfile();
        await finalize(profile);
      } catch {
        // Tokens invalid — silently clear and stay disconnected
        clearTokens();
        set({ account: null, author: localAuthor, isAuthenticated: false, isLoading: false });
      }
    }
  },

  connectAccount: async (email: string, code: string) => {
    const creds = await authApi.login(email, code);
    storeTokens(creds.accessToken, creds.refreshToken);

    const profile = await authApi.getProfile();

    // Reconcile local author ID with API author
    let author: Author | null = profile.author ?? null;
    if (profile.author) {
      const { author: localAuthor } = useAuthStore.getState();
      if (localAuthor && localAuthor.id !== profile.author.id) {
        author = await reconcileAuthorId(localAuthor.id, profile.author, profile.id);
      }
    }

    set({
      account: profile,
      author,
      isAuthenticated: true,
    });
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
    const { author, isAuthenticated } = useAuthStore.getState();
    if (!author) throw new Error('No author');

    const updated = await (await lazyGetServices()).author.update(author.id, dto);
    set({ author: updated });
    if (isAuthenticated) syncAuthorToApi(updated);
    return updated;
  },

  uploadAvatar: async (file: File) => {
    const { author, isAuthenticated } = useAuthStore.getState();
    if (!author) throw new Error('No author');

    const dataUrl = await fileToDataUrl(file);
    const updated = await (await lazyGetServices()).author.update(author.id, {
      meta: { ...author.meta, avatarUrl: dataUrl },
    });
    set({ author: updated });
    if (isAuthenticated) syncAuthorToApi(updated);
    return updated;
  },

  removeAvatar: async () => {
    const { author, isAuthenticated } = useAuthStore.getState();
    if (!author) throw new Error('No author');

    const meta = { ...author.meta, avatarUrl: null };
    const updated = await (await lazyGetServices()).author.update(author.id, { meta });
    set({ author: updated });
    if (isAuthenticated) {
      syncAuthorToApi(updated);
      // Also remove the avatar file from API storage
      authorsApi.removeAvatar(author.id).catch(() => {});
    }
  },
}));
