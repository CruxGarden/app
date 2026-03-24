import { useState, useCallback, useEffect, useRef } from 'react';
import { authors } from '@/api';
import { useAppStore } from '@/stores/appStore';
import { Modal, Button, Input } from '@/components/ui';

interface CreateAuthorModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateAuthorModal({ open, onClose, onCreated }: CreateAuthorModalProps) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const checkTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounced username availability check
  useEffect(() => {
    setUsernameError('');
    if (!username || username.length < 3) return;

    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    checkTimeout.current = setTimeout(async () => {
      try {
        const { available } = await authors.checkUsername(username);
        if (!available) setUsernameError('Username is taken');
      } catch {
        // Ignore check errors
      }
    }, 400);

    return () => {
      if (checkTimeout.current) clearTimeout(checkTimeout.current);
    };
  }, [username]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!username || username.length < 3) {
        setUsernameError('Username must be at least 3 characters');
        return;
      }
      if (usernameError) return;

      setSubmitting(true);
      try {
        const author = await authors.create({
          username,
          displayName: displayName || username,
        });
        // Update auth store with new author
        useAppStore.setState({ author });
        onCreated();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create author';
        setUsernameError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [username, displayName, usernameError, onCreated],
  );

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h2 className="text-lg font-display font-medium text-text">Choose a username</h2>
          <p className="text-sm text-text-muted mt-1">
            Your creations will live at crux.garden/username
          </p>
        </div>

        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
          placeholder="username"
          error={usernameError}
          autoFocus
        />

        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name (optional)"
        />

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!username || !!usernameError}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
