import { create } from 'zustand';
import { useAuthStore, _avatarUrlCache } from './authStore';
import * as authorsApi from '@/api/authors';
import type { Author } from '@/api/types';

// Lazy import to avoid pulling SQLite worker into public pages
async function lazyGetServices() {
  const { getServices } = await import('@/services');
  return getServices();
}

async function lazyGetDb() {
  const { getSqliteClient } = await import('@/services/sqlite/client');
  return getSqliteClient();
}

async function lazyHashContent(content: Uint8Array): Promise<string> {
  const { hashContent } = await import('@/services/sqlite/helpers');
  return hashContent(content);
}

// Re-use the shared avatar URL cache from authStore

/**
 * Sync local author data to the API (username, displayName, bio, avatar).
 * Runs in the background — failures are non-fatal.
 */
export async function syncAuthorToApi(author: Author): Promise<void> {
  try {
    // Sync profile fields
    await authorsApi.update(author.id, {
      username: author.username,
      displayName: author.displayName,
      bio: author.bio,
    });

    // Sync avatar if stored in OPFS
    const fingerprint = author.meta?.avatarFingerprint;
    if (typeof fingerprint === 'string') {
      const db = await lazyGetDb();
      const data = await db.blobRead(fingerprint);
      const mimeType = (author.meta?.avatarMimeType as string) || 'image/jpeg';
      const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType });
      const file = new File([blob], 'avatar', { type: mimeType });
      await authorsApi.uploadAvatar(author.id, file);
    }
  } catch {
    // Non-fatal — will retry on next sync opportunity
  }
}

interface AppState {
  /** Whether services (SQLite, OPFS, local author) are initialized */
  ready: boolean;

  /** The local author profile */
  author: Author | null;

  /** Ensure a local author exists. Creates one if needed, sets it on the store. */
  ensureAuthor: () => Promise<Author>;

  /** Set author directly */
  setAuthor: (author: Author | null) => void;

  /** Update author fields (username, displayName, etc.) */
  updateAuthor: (dto: { username?: string; displayName?: string; bio?: string }) => Promise<Author>;

  /** Upload avatar and update local author */
  uploadAvatar: (file: File) => Promise<Author>;

  /** Remove avatar */
  removeAvatar: () => Promise<void>;

  /**
   * Initialize the app. Call once on mount for app routes.
   * - Full mode: initializes SQLite + OPFS, creates local author, then checks auth
   * - Lightweight mode: skips services init, just refreshes auth tokens (for public pages)
   */
  init: (opts?: { lightweight?: boolean }) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  author: null,

  setAuthor: (author) => set({ author }),

  ensureAuthor: async () => {
    const { ensureLocalAuthor } = await import('@/services');
    const author = await ensureLocalAuthor();
    set({ author });
    return author;
  },

  init: async (opts) => {
    if (get().ready && !opts?.lightweight) return;

    if (!opts?.lightweight) {
      // Initialize SQLite, OPFS, and settings.
      // initServices() calls initSettings() internally.
      const { initServices } = await import('@/services');
      await initServices();
      await get().ensureAuthor();
      set({ ready: true });
    }

    // Check stored tokens and refresh if needed
    await useAuthStore.getState().checkAuth(opts);
  },

  updateAuthor: async (dto) => {
    const { author } = get();
    const { isAuthenticated } = useAuthStore.getState();
    if (!author) throw new Error('No author');

    const updated = await (await lazyGetServices()).author.update(author.id, dto);
    set({ author: updated });
    if (isAuthenticated) syncAuthorToApi(updated);
    return updated;
  },

  uploadAvatar: async (file: File) => {
    const { author } = get();
    const { isAuthenticated } = useAuthStore.getState();
    if (!author) throw new Error('No author');

    // Write avatar to OPFS blob store (content-addressable)
    const buffer = new Uint8Array(await file.arrayBuffer());
    const fingerprint = await lazyHashContent(buffer);
    const db = await lazyGetDb();
    await db.blobWrite(fingerprint, buffer);

    // Delete old blob if fingerprint changed
    const oldFingerprint = author.meta?.avatarFingerprint;
    if (typeof oldFingerprint === 'string' && oldFingerprint !== fingerprint) {
      db.blobDelete(oldFingerprint).catch(() => {});
    }

    // Revoke old object URL if cached
    const oldUrl = _avatarUrlCache.get(oldFingerprint as string);
    if (oldUrl) { URL.revokeObjectURL(oldUrl); _avatarUrlCache.delete(oldFingerprint as string); }

    const updated = await (await lazyGetServices()).author.update(author.id, {
      meta: { ...author.meta, avatarFingerprint: fingerprint, avatarMimeType: file.type, avatarUrl: null },
    });
    set({ author: updated });
    if (isAuthenticated) syncAuthorToApi(updated);
    return updated;
  },

  removeAvatar: async () => {
    const { author } = get();
    const { isAuthenticated } = useAuthStore.getState();
    if (!author) throw new Error('No author');

    // Delete OPFS blob
    const fingerprint = author.meta?.avatarFingerprint;
    if (typeof fingerprint === 'string') {
      const db = await lazyGetDb();
      db.blobDelete(fingerprint).catch(() => {});
      const oldUrl = _avatarUrlCache.get(fingerprint);
      if (oldUrl) { URL.revokeObjectURL(oldUrl); _avatarUrlCache.delete(fingerprint); }
    }

    const meta = { ...author.meta, avatarFingerprint: null, avatarMimeType: null, avatarUrl: null };
    const updated = await (await lazyGetServices()).author.update(author.id, { meta });
    set({ author: updated });
    if (isAuthenticated) {
      syncAuthorToApi(updated);
      authorsApi.removeAvatar(author.id).catch(() => {});
    }
  },
}));
