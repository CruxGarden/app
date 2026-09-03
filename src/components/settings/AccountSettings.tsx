import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { authors as authorsApi } from '@/api';
import { Panel, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import ConnectAccount from '@/components/auth/ConnectAccount';
import AvatarUpload from '@/components/auth/AvatarUpload';
import { useShallow } from 'zustand/react/shallow';

export default function AccountSettings() {
  const { account, isAuthenticated } = useAuthStore(
    useShallow((s) => ({ account: s.account, isAuthenticated: s.isAuthenticated })),
  );
  const { author, updateAuthor } = useAppStore(
    useShallow((s) => ({ author: s.author, updateAuthor: s.updateAuthor })),
  );

  // Username editing
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Inline format validation
  const validateFormat = (name: string): string => {
    if (!name) return '';
    if (name.length < 3) return 'At least 3 characters';
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 'Letters, numbers, hyphens, underscores only';
    return '';
  };

  // Debounced API availability check
  const checkAvailability = (name: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!name || name.length < 3 || !isAuthenticated) return;
    if (name.toLowerCase() === author?.username?.toLowerCase()) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const { available } = await authorsApi.checkUsername(name.toLowerCase());
        if (!available) setUsernameError('Username is taken at crux.garden');
      } catch {
        /* API unavailable */
      }
    }, 400);
  };

  const handleUsernameChange = (value: string) => {
    setUsernameValue(value);
    const formatError = validateFormat(value.trim());
    setUsernameError(formatError);
    if (!formatError) checkAvailability(value.trim());
  };

  // Cleanup debounce timer
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

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
    const formatError = validateFormat(trimmed);
    if (formatError) {
      setUsernameError(formatError);
      return;
    }
    setSavingUsername(true);
    setUsernameError('');
    try {
      const lower = trimmed.toLowerCase();
      if (isAuthenticated && lower !== author?.username?.toLowerCase()) {
        const { available } = await authorsApi.checkUsername(lower);
        if (!available) {
          setUsernameError('Username is taken at crux.garden');
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

  return (
    <Panel padding="md">
      <h2 className="font-display text-sm font-medium text-settings-label mb-4">Account</h2>

      {/* Avatar */}
      <div className="mb-4">
        <AvatarUpload />
      </div>

      <div className="space-y-3 text-sm">
        {/* Username */}
        <div className="flex justify-between items-center">
          <span className="text-text-muted">Username</span>
          {editingUsername ? (
            <div className="flex items-center gap-2">
              <input
                ref={usernameRef}
                type="text"
                value={usernameValue}
                onChange={(e) => handleUsernameChange(e.target.value)}
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
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveUsername}
                disabled={savingUsername}
              >
                {savingUsername ? '...' : 'Save'}
              </Button>
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
              className="text-text hover:text-accent transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {author?.username ?? '\u2014'}
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

        {/* Email + Role (only when connected) */}
        {isAuthenticated && (
          <>
            <div className="flex justify-between">
              <span className="text-text-muted">Email</span>
              <span className="text-text">{account?.email ?? '\u2014'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Role</span>
              <span className="text-text">{account?.role ?? '\u2014'}</span>
            </div>
          </>
        )}
      </div>

      {/* Connection */}
      <div className="border-t border-border my-5" />
      <h3 className="font-display text-sm font-medium text-accent mb-2">
        Connection{isAuthenticated ? ' (crux.garden)' : ''}
      </h3>
      <ConnectAccount description="Connect to your crux.garden account to enable sync and sharing." />
    </Panel>
  );
}
