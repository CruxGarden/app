import { useState } from 'react';
import { buttonClass } from '@/components/ui/button-class';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useShallow } from 'zustand/react/shallow';

const btnClass = cn(buttonClass('secondary', 'xs'));

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
  const { isAuthenticated, account, connectAccount, disconnectAccount, connectionError } =
    useAuthStore(
      useShallow((s) => ({
        isAuthenticated: s.isAuthenticated,
        account: s.account,
        connectionError: s.connectionError,
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
    } catch (err) {
      // A deliberate refusal (a different account than this garden's) says why;
      // anything else is the code or the connection.
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.startsWith('Not connected') || msg.startsWith('Could not save the account connection')
          ? msg
          : 'Invalid code or connection failed',
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setError('');
    setConnecting(true);
    try {
      await disconnectAccount();
      onDisconnected?.();
    } catch {
      setError('Could not remove the saved connection. Restore credential storage and retry.');
    } finally {
      setConnecting(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted">
            Connected — <span className="text-text font-mono ml-1">{account?.email}</span>
          </p>
          <button
            onClick={handleDisconnect}
            disabled={connecting}
            className={buttonClass(
              'ghost',
              'xs',
              'text-error hover:text-error hover:bg-error-muted',
            )}
          >
            {connecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
        {(error || connectionError) && (
          <p role="alert" className="text-xs text-error">
            {error || connectionError}
          </p>
        )}
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
            'flex-1 px-3 py-1.5 text-xs font-body rounded-[var(--radius-sm)]',
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
              'flex-1 px-3 py-1.5 text-xs font-body rounded-[var(--radius-sm)]',
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
      {(error || connectionError) && (
        <p role="alert" className="text-xs text-error">
          {error || connectionError}
        </p>
      )}
      {connectionError && (
        <button className={btnClass} onClick={() => void useAuthStore.getState().checkAuth()}>
          Retry saved connection
        </button>
      )}
    </div>
  );
}
