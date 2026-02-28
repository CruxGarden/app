import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { authors as authorsApi } from '@/api';
import { Panel, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const API_KEY_STORAGE = 'cruxgarden:anthropicApiKey';

function ClaudeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#D97757">
      <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
    </svg>
  );
}

function buildAvatarUrl(author: { id: string; meta?: Record<string, unknown> } | null, bust: number): string | null {
  if (!author?.meta?.avatarUrl) return null;
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return `${base}${author.meta.avatarUrl}?v=${bust}`;
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

  const [apiKey, setApiKey] = useState('');
  const [apiKeyHint, setApiKeyHint] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE);
    if (stored) {
      setApiKeyHint(`${stored.slice(0, 7)}...${stored.slice(-4)}`);
    }
  }, []);

  const handleSaveApiKey = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    localStorage.setItem(API_KEY_STORAGE, trimmed);
    setApiKeyHint(`${trimmed.slice(0, 7)}...${trimmed.slice(-4)}`);
    setApiKey('');
  };

  const handleRemoveApiKey = () => {
    localStorage.removeItem(API_KEY_STORAGE);
    setApiKeyHint('');
    setApiKey('');
  };

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
      if (lower !== author?.username?.toLowerCase()) {
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
              <img
                src={avatar}
                alt="Avatar"
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center',
                'bg-accent-muted text-accent text-lg font-display font-bold',
              )}>
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
                  onChange={(e) => { setUsernameValue(e.target.value); setUsernameError(''); }}
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
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
          {usernameError && (
            <p className="text-xs text-error text-right">{usernameError}</p>
          )}
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

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted flex items-center gap-1.5"><ClaudeIcon /> Claude</span>
            <span className={cn(
              'text-xs font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)]',
              apiKeyHint
                ? 'text-accent bg-accent-muted'
                : 'text-text-muted bg-surface',
            )}>
              {apiKeyHint || 'Not configured'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey(); }}
              placeholder={apiKeyHint ? 'Replace key...' : 'sk-ant-...'}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                'bg-surface border border-border text-text placeholder:text-text-muted/50',
                'outline-none focus:border-accent transition-colors',
              )}
            />
            <button
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim()}
              className={cn(
                'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                'bg-surface border border-border text-text hover:bg-accent-muted transition-colors cursor-pointer',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              Save
            </button>
            {apiKeyHint && (
              <button
                onClick={handleRemoveApiKey}
                className={cn(
                  'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                  'text-error hover:bg-error-muted transition-colors cursor-pointer',
                )}
              >
                Remove
              </button>
            )}
          </div>

          <p className="text-xs text-text-muted">
            Your key is stored locally in this browser and never saved to our servers.
          </p>
        </div>
      </Panel>
    </div>
  );
}
