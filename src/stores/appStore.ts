import { create } from 'zustand';
import { useAuthStore } from './authStore';
import * as authorsApi from '@/api/authors';
import type { Author } from '@/api/types';

// Lazy import to avoid pulling SQLite worker into public pages
async function lazyGetServices() {
  const { getServices } = await import('@/services');
  return getServices();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

    const dataUrl = await fileToDataUrl(file);
    const updated = await (await lazyGetServices()).author.update(author.id, {
      meta: { ...author.meta, avatarUrl: dataUrl },
    });
    set({ author: updated });
    if (isAuthenticated) syncAuthorToApi(updated);
    return updated;
  },

  removeAvatar: async () => {
    const { author } = get();
    const { isAuthenticated } = useAuthStore.getState();
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
