import { useState, useRef, useCallback } from 'react';
import { useAuthStore, resolveAvatarUrl } from '@/stores/authStore';
import { authors as authorsApi } from '@/api';
import { getBackend } from '@/services';
import { Panel, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pixelateImageToDataURL } from '@/lib/pixelate';

const btnClass = cn(
  'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
  'bg-surface border border-border text-text hover:bg-accent-muted transition-colors cursor-pointer',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

export default function AccountSettings() {
  const { account, author, isAuthenticated, uploadAvatar, removeAvatar, updateAuthor, connectAccount, disconnectAccount } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Pixelation preview
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [blockSize, setBlockSize] = useState(8);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Username editing
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  // Connection flow
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');

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

  const handleSendCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setConnectionError('Please enter a valid email address');
      return;
    }
    setConnectionError('');
    setConnecting(true);
    try {
      const { requestCode } = useAuthStore.getState();
      await requestCode(email);
      setCodeSent(true);
    } catch {
      setConnectionError('Failed to send code');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    setConnectionError('');
    setConnecting(true);
    try {
      await connectAccount(email, code);
      setEmail('');
      setCode('');
      setCodeSent(false);
    } catch {
      setConnectionError('Invalid code or connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    try {
      await disconnectAccount();
    } finally {
      setConnecting(false);
    }
  };

  const generatePreview = useCallback(async (file: File, size: number) => {
    setGenerating(true);
    try {
      const url = await pixelateImageToDataURL(file, {
        blockSize: size,
        outputSize: { width: 256, height: 256 },
      });
      setPreviewUrl(url);
    } catch (err) {
      console.error('Pixelation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    setPendingFile(file);
    setBlockSize(8);
    await generatePreview(file, 8);
  };

  const handleConfirmAvatar = async () => {
    if (!previewUrl) return;
    setUploading(true);
    try {
      // Convert the pixelated data URL to a File and upload
      const res = await fetch(previewUrl);
      const blob = await res.blob();
      const file = new File([blob], 'avatar.png', { type: 'image/png' });
      await uploadAvatar(file);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploading(false);
      setPendingFile(null);
      setPreviewUrl(null);
    }
  };

  const handleCancelAvatar = () => {
    setPendingFile(null);
    setPreviewUrl(null);
  };

  const handleBlockSizeChange = async (size: number) => {
    setBlockSize(size);
    if (pendingFile) await generatePreview(pendingFile, size);
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

  const initial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const avatar = resolveAvatarUrl(author);

  return (
    <Panel padding="md">
      <h2 className="font-display text-sm font-medium text-settings-label mb-4">Account</h2>

      {/* Avatar + profile (always shown) */}
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
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className={btnClass}>
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
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
      </div>

      {/* Pixelation preview */}
      {pendingFile && (
        <div className="flex items-start gap-4 mb-4 p-3 bg-surface border border-border rounded-[var(--radius-sm)]">
          <div className="relative shrink-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-20 h-20 rounded-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-accent-muted flex items-center justify-center">
                <Spinner size={16} />
              </div>
            )}
            {generating && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/60">
                <Spinner size={16} />
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted font-mono shrink-0">Pixel size</label>
              <input
                type="range"
                min={2}
                max={32}
                step={1}
                value={blockSize}
                onChange={(e) => handleBlockSizeChange(Number(e.target.value))}
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="text-xs text-text-muted font-mono w-6 text-right">{blockSize}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleConfirmAvatar} disabled={uploading || generating} className={btnClass}>
                {uploading ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancelAvatar}
                className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button onClick={handleSaveUsername} disabled={savingUsername} className={btnClass}>
                {savingUsername ? '...' : 'Save'}
              </button>
              <button onClick={cancelEditingUsername} className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={startEditingUsername} className="text-text hover:text-accent transition-colors cursor-pointer flex items-center gap-1.5">
              {author?.username ?? '\u2014'}
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

      {/* Cloud connection */}
      <div className="border-t border-border my-5" />
      <h3 className="font-display text-sm font-medium text-accent mb-2">Connection</h3>

      {isAuthenticated ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Connected as <span className="text-text font-mono">{account?.email}</span>
          </p>
          <button onClick={handleDisconnect} disabled={connecting} className={cn(btnClass, 'text-error border-error hover:bg-error/10')}>
            {connecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            Connect to your crux.garden account to enable sync and sharing.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setConnectionError(''); }}
              placeholder="email@example.com"
              disabled={connecting || codeSent}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                'bg-surface border border-border text-text placeholder:text-text-muted',
                'focus:outline-none focus:border-accent',
                'disabled:opacity-50',
              )}
            />
            {!codeSent && (
              <button onClick={handleSendCode} disabled={connecting || !email} className={btnClass}>
                {connecting ? <Spinner size={12} /> : 'Send Code'}
              </button>
            )}
          </div>
          {codeSent && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setConnectionError(''); }}
                placeholder="Enter code"
                disabled={connecting}
                className={cn(
                  'flex-1 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                  'bg-surface border border-border text-text placeholder:text-text-muted',
                  'focus:outline-none focus:border-accent',
                  'disabled:opacity-50',
                )}
              />
              <button onClick={handleConnect} disabled={connecting || !code} className={btnClass}>
                {connecting ? <Spinner size={12} /> : 'Connect'}
              </button>
              <button
                onClick={() => { setCodeSent(false); setCode(''); }}
                className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
          {connectionError && <p className="text-xs text-error">{connectionError}</p>}
        </div>
      )}
    </Panel>
  );
}
