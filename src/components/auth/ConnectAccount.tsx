import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useShallow } from 'zustand/react/shallow';

const btnClass = cn(
  'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
  'bg-surface border border-border text-text hover:bg-accent-muted cursor-pointer',
  'disabled:cursor-not-allowed',
);

interface ConnectAccountProps {
  /** Optional description shown above the form */
  description?: string;
  /** Called after a successful connection */
  onConnected?: () => void;
  /** Called after disconnecting */
  onDisconnected?: () => void;
  /** Compact mode — no description, tighter spacing */
  compact?: boolean;
  /** Auto-focus the email input on mount */
  autoFocus?: boolean;
}

/**
 * Reusable email + code connect form.
 * Used in Settings, PublishPane, SyncPane, and anywhere auth is needed inline.
 */
export default function ConnectAccount({
  description,
  onConnected,
  onDisconnected,
  compact,
  autoFocus,
}: ConnectAccountProps) {
  const { isAuthenticated, account, connectAccount, disconnectAccount } = useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      account: s.account,
      connectAccount: s.connectAccount,
      disconnectAccount: s.disconnectAccount,
    })),
  );

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleSendCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setConnecting(true);
    try {
      const { requestCode } = useAuthStore.getState();
      await requestCode(email);
      setCodeSent(true);
    } catch {
      setError('Failed to send code');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    setError('');
    setConnecting(true);
    try {
      await connectAccount(email, code);
      setEmail('');
      setCode('');
      setCodeSent(false);
      onConnected?.();
    } catch {
      setError('Invalid code or connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    try {
      await disconnectAccount();
      onDisconnected?.();
    } finally {
      setConnecting(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          Connected — <span className="text-text font-mono ml-1">{account?.email}</span>
        </p>
        <button
          onClick={handleDisconnect}
          disabled={connecting}
          className={cn(
            'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
            'text-error hover:bg-error-muted cursor-pointer',
            'disabled:cursor-not-allowed',
          )}
        >
          {connecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {description && <p className="text-xs text-text-muted">{description}</p>}
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
          placeholder="email@example.com"
          autoFocus={autoFocus}
          disabled={connecting || codeSent}
          className={cn(
            'flex-1 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
            'bg-surface border border-border text-text placeholder:text-text-muted',
            'focus:outline-none focus:border-input-border-active',
            '',
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
            onChange={(e) => {
              setCode(e.target.value);
              setError('');
            }}
            placeholder="Enter code"
            autoFocus
            disabled={connecting}
            className={cn(
              'flex-1 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
              'bg-surface border border-border text-text placeholder:text-text-muted',
              'focus:outline-none focus:border-input-border-active',
              '',
            )}
          />
          <button onClick={handleConnect} disabled={connecting || !code} className={btnClass}>
            {connecting ? <Spinner size={12} /> : 'Connect'}
          </button>
          <button
            onClick={() => {
              setCodeSent(false);
              setCode('');
            }}
            className="text-xs text-text-muted hover:text-text cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
