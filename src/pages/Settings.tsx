import { useState, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { authors as authorsApi } from '@/api';
import { getBackend } from '@/services';
import { ApiKeySetup, Panel, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import MoodSettings from '@/components/settings/MoodSettings';
import DataSettings from '@/components/settings/DataSettings';

function buildAvatarUrl(
  author: { id: string; meta?: Record<string, unknown> } | null,
  bust: number,
): string | null {
  const url = author?.meta?.avatarUrl;
  if (!url || typeof url !== 'string') return null;
  // Data URLs (local mode) are already complete
  if (url.startsWith('data:')) return url;
  // API URLs are relative — prepend the API base
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return `${base}${url}?v=${bust}`;
}

export default function Settings() {
  const { account, author, uploadAvatar, removeAvatar, updateAuthor } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarBust, setAvatarBust] = useState(Date.now());

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  const startEditingUsername = () => {
    setUsernameValue(author?.username ?? '');
    setUsernameError('');
    setEditingUsername(true);
    setTimeout(() => usernameRef.current?.focus(), 0);
  };

  const cancelEditingUsername = () => {
    setEditingUsername(false);
    setUsernameError('');
  };

  const handleSaveUsername = async () => {
    const trimmed = usernameValue.trim();
    if (!trimmed) return;
    if (trimmed === author?.username) {
      setEditingUsername(false);
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setUsernameError('Letters, numbers, hyphens, underscores only');
      return;
    }
    setSavingUsername(true);
    setUsernameError('');
    try {
      const lower = trimmed.toLowerCase();
      // Only check username availability against the API when using the API backend
      if (getBackend() === 'api' && lower !== author?.username?.toLowerCase()) {
        const { available } = await authorsApi.checkUsername(lower);
        if (!available) {
          setUsernameError('Username is taken');
          setSavingUsername(false);
          return;
        }
      }
      await updateAuthor({ username: trimmed });
      setEditingUsername(false);
    } catch {
      setUsernameError('Failed to update');
    } finally {
      setSavingUsername(false);
    }
  };

  const initial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const avatar = buildAvatarUrl(author, avatarBust);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAvatar(file);
      setAvatarBust(Date.now());
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setUploading(true);
    try {
      await removeAvatar();
    } catch (err) {
      console.error('Avatar remove failed:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-text mb-8">Settings</h1>

      <Panel padding="md">
        {/* Account */}
        <h2 className="font-display text-sm font-medium text-accent mb-4">Account</h2>

        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div
                className={cn(
                  'w-14 h-14 rounded-full flex items-center justify-center',
                  'bg-accent-muted text-accent text-lg font-display font-bold',
                )}
              >
                {initial}
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/60">
                <Spinner size={16} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn(
                'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                'bg-surface border border-border text-text hover:bg-accent-muted transition-colors cursor-pointer',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {uploading ? 'Uploading...' : avatar ? 'Change photo' : 'Upload photo'}
            </button>
            {avatar && (
              <button
                onClick={handleRemoveAvatar}
                disabled={uploading}
                className={cn(
                  'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                  'text-error hover:bg-error-muted transition-colors cursor-pointer',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-text-muted">Username</span>
            {editingUsername ? (
              <div className="flex items-center gap-2">
                <input
                  ref={usernameRef}
                  type="text"
                  value={usernameValue}
                  onChange={(e) => {
                    setUsernameValue(e.target.value);
                    setUsernameError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveUsername();
                    if (e.key === 'Escape') cancelEditingUsername();
                  }}
                  className={cn(
                    'px-2 py-0.5 text-sm font-mono rounded-[var(--radius-sm)]',
                    'bg-surface border text-text outline-none transition-colors',
                    usernameError ? 'border-error' : 'border-border focus:border-accent',
                  )}
                />
                <button
                  onClick={handleSaveUsername}
                  disabled={savingUsername}
                  className={cn(
                    'px-2 py-0.5 text-xs font-mono rounded-[var(--radius-sm)]',
                    'bg-surface border border-border text-text hover:bg-accent-muted transition-colors cursor-pointer',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {savingUsername ? '...' : 'Save'}
                </button>
                <button
                  onClick={cancelEditingUsername}
                  className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={startEditingUsername}
                className="text-text hover:text-accent transition-colors cursor-pointer flex items-center gap-1.5 group"
              >
                {author?.username ?? '—'}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-text-muted"
                >
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
              </button>
            )}
          </div>
          {editingUsername && (
            <p className="text-xs text-text-muted text-right">
              Be aware. Changing your username also changes your public garden URL
            </p>
          )}
          {usernameError && <p className="text-xs text-error text-right">{usernameError}</p>}
          <div className="flex justify-between">
            <span className="text-text-muted">Email</span>
            <span className="text-text">{account?.email ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Role</span>
            <span className="text-text">{account?.role ?? '—'}</span>
          </div>
        </div>

        <div className="border-t border-border my-5" />

        {/* API Keys */}
        <h2 className="font-display text-sm font-medium text-accent mb-4">API Keys</h2>
        <ApiKeySetup />
      </Panel>

      <div className="mt-6">
        <MoodSettings />
      </div>

      <div className="mt-6">
        <DataSettings />
      </div>
    </div>
  );
}
