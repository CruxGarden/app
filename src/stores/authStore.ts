import { create } from 'zustand';
import * as authApi from '@/api/auth';
import { getStoredTokens, storeTokens, clearTokens } from '@/api/client';
import type { Profile, Author } from '@/api/types';
import { SettingsKey } from '@/lib/constants';

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
    await db.run('UPDATE authors SET id = ?, account_id = ?, updated = ? WHERE id = ?', [
      newId,
      accountId,
      new Date().toISOString(),
      oldId,
    ]);
    await db.run(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('${SettingsKey.LocalAuthorId}', ?)`,
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
 * Resolve an author's avatar URL for display.
 *
 * Priority:
 * 1. OPFS blob (local authors) — avatarFingerprint in meta → object URL from blob
 * 2. Data URL (legacy) — avatarUrl starting with "data:"
 * 3. API-relative path (public pages viewing other authors) — avatarUrl like "/authors/123/avatar"
 * 4. Full URL — avatarUrl starting with "http"
 *
 * For OPFS blobs, call resolveAvatarUrlAsync() instead — this sync version
 * returns null for fingerprint-based avatars that haven't been loaded yet.
 */
export function resolveAvatarUrl(
  author: { meta?: Record<string, unknown>; updated?: string } | null,
): string | null {
  // Check OPFS fingerprint — if present, check the cache for a pre-loaded object URL
  const fingerprint = author?.meta?.avatarFingerprint;
  if (typeof fingerprint === 'string') {
    // Import the cache from appStore (shared module-level Map)
    const cached = _avatarUrlCache.get(fingerprint);
    return cached ?? null;
  }

  // Legacy data URL or full URL
  const url = author?.meta?.avatarUrl || author?.meta?.avatar_url;
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:') || url.startsWith('http')) return url;

  // API-relative path (for public pages viewing other authors)
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return `${base}${url}?v=${author?.updated || ''}`;
}

/**
 * Async version that loads the avatar blob from OPFS if needed.
 * Returns an object URL that should NOT be revoked by callers
 * (the cache manages lifecycle).
 */
export async function resolveAvatarUrlAsync(
  author: { meta?: Record<string, unknown>; updated?: string } | null,
): Promise<string | null> {
  const fingerprint = author?.meta?.avatarFingerprint;
  if (typeof fingerprint === 'string') {
    const cached = _avatarUrlCache.get(fingerprint);
    if (cached) return cached;

    try {
      const { blobObjectUrl } = await import('@/services/blobs');
      const mimeType = (author?.meta?.avatarMimeType as string) || 'image/jpeg';
      const url = await blobObjectUrl(fingerprint, mimeType);
      _avatarUrlCache.set(fingerprint, url);
      return url;
    } catch {
      return null;
    }
  }

  return resolveAvatarUrl(author);
}

// Shared cache for avatar object URLs (fingerprint → objectURL)
export const _avatarUrlCache = new Map<string, string>();

interface AuthState {
  account: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** Check stored tokens and restore auth state. Called by appStore.init().
   *  Pass { lightweight: true } on public pages to skip author reconciliation. */
  checkAuth: (opts?: { lightweight?: boolean }) => Promise<void>;

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
}

export const useAuthStore = create<AuthState>((set) => ({
  account: null,
  isAuthenticated: false,
  isLoading: true,

  checkAuth: async (opts) => {
    const { accessToken, refreshToken } = getStoredTokens();
    if (!accessToken || !refreshToken) {
      set({ isLoading: false });
      return;
    }

    // Lazy import to avoid circular dependency at module load time
    const { useAppStore } = await import('./appStore');
    const { syncAuthorToApi } = await import('./appStore');
    const localAuthor = useAppStore.getState().author;

    const finalize = async (profile: Profile) => {
      // Re-read: the profile fetch is slow enough that the Gateway may have
      // created the local author meanwhile. Writing the value captured before
      // the await nulled it and left the app anonymous until reload.
      let author = useAppStore.getState().author ?? localAuthor;
      // Reconcile local author ID with API author if mismatched (skip in lightweight mode)
      if (!opts?.lightweight && author && profile.author && author.id !== profile.author.id) {
        author = await reconcileAuthorId(author.id, profile.author, profile.id);
      }
      set({
        account: profile,
        isAuthenticated: true,
        isLoading: false,
      });
      if (author) {
        useAppStore.setState({ author });
        syncAuthorToApi(author);
      }
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
        set({ account: null, isAuthenticated: false, isLoading: false });
      }
    }
  },

  connectAccount: async (email: string, code: string) => {
    const creds = await authApi.login(email, code);
    storeTokens(creds.accessToken, creds.refreshToken);

    const profile = await authApi.getProfile();

    // Lazy import to avoid circular dependency at module load time
    const { useAppStore } = await import('./appStore');
    const { syncAuthorToApi } = await import('./appStore');

    // Reconcile local author ID with API author
    let author: Author | null = profile.author ?? null;
    const localAuthor = useAppStore.getState().author;

    if (profile.author && localAuthor) {
      if (localAuthor.id !== profile.author.id) {
        author = await reconcileAuthorId(localAuthor.id, profile.author, profile.id);
      }

      // If the API account already has a username, prefer it over the local one.
      // The user chose it previously (possibly on another device).
      const apiUsername = profile.author.username;
      const apiDisplayName = profile.author.displayName;
      if (apiUsername && author) {
        try {
          const svc = (await import('@/services')).getServices();
          author = await svc.author.update(author.id, {
            username: apiUsername,
            ...(apiDisplayName ? { displayName: apiDisplayName } : {}),
          });
        } catch {
          /* non-fatal */
        }
      }
    }

    set({
      account: profile,
      isAuthenticated: true,
    });
    useAppStore.setState({ author });
    // Sync local data the API doesn't have yet (avatar, bio)
    if (author) syncAuthorToApi(author);
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

    // Lazy import to avoid circular dependency at module load time
    const { useAppStore } = await import('./appStore');

    set({
      account: profile,
      isAuthenticated: true,
    });
    useAppStore.setState({ author: profile.author ?? null });
    return profile;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore — clear local state regardless
    }
    clearTokens();

    // Lazy import to avoid circular dependency at module load time
    const { useAppStore } = await import('./appStore');

    set({ account: null, isAuthenticated: false });
    useAppStore.setState({ author: null });
  },
}));
