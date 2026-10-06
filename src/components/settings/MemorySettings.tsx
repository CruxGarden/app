import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmDialog } from '@/stores/dialogStore';
import SettingsSection from './SettingsSection';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { plainError } from '@/lib/error-text';
import { Capability, can } from '@/lib/platform';
import { getGardenRoot, shortenHomePath } from '@/services/desktop';
import {
  MEMORY_FILE,
  clearMemory,
  forgetMemoryLine,
  getMemory,
  isMemoryEmpty,
  memoryEntries,
  onMemoryChanged,
  setMemory,
  syncMemoryFromDisk,
} from '@/services/memory';

/**
 * Settings → Memory (B6, ADR 0013): the garden's memory.md as an editable
 * textarea (saved on blur), each remembered line with a Forget button, and
 * Clear. The one place the person sees exactly what the collaborator carries
 * into every conversation — no hidden memory (ADR 0008).
 */
export default function MemorySettings() {
  const [text, setText] = useState(() => getMemory());
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const baseline = useRef(getMemory());
  const [mirrorPath, setMirrorPath] = useState<string | null>(null);
  const desktop = can(Capability.ProjectFolder);

  // Adopt an outside edit of the desktop mirror when the panel opens; follow
  // writes made elsewhere (the `remember` tool) while it is open.
  useEffect(() => {
    let live = true;
    void syncMemoryFromDisk({ strict: true })
      .then((t) => {
        if (live && !dirtyRef.current) {
          baseline.current = t;
          setText(t);
        }
      })
      .catch((cause) => {
        if (live) setError(plainError(cause, 'Could not load memory.'));
      });
    if (desktop) {
      getGardenRoot().then((root) => {
        if (live && root) setMirrorPath(shortenHomePath(`${root}/${MEMORY_FILE}`));
      });
    }
    const off = onMemoryChanged((t) => {
      if (live && !dirtyRef.current) {
        baseline.current = t;
        setText(t);
        setDirty(false);
      }
    });
    return () => {
      live = false;
      off();
    };
  }, [desktop]);

  const change = useCallback(async (action: () => Promise<void>) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await action();
      setStatus('Saved');
      setTimeout(() => setStatus(''), 1500);
    } catch (cause) {
      setError(plainError(cause, 'Could not save memory. Your edits are still here.'));
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }, []);
  const save = useCallback(async () => {
    if (!dirty) return;
    await change(async () => {
      const saved = await setMemory(text, baseline.current);
      baseline.current = saved;
      setText(saved);
      dirtyRef.current = false;
      setDirty(false);
    });
  }, [dirty, text, change]);
  const reload = async () => {
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Reload memory',
        message:
          'Replace your unsaved memory edits with the saved notes? Copy any edits you want to keep first.',
        confirmLabel: 'Reload',
      }))
    )
      return;
    await change(async () => {
      const saved = await syncMemoryFromDisk({ strict: true });
      baseline.current = saved;
      setText(saved);
      dirtyRef.current = false;
      setDirty(false);
    });
  };

  const entries = memoryEntries(text);
  const empty = isMemoryEmpty(text);

  return (
    <SettingsSection
      title="Memory"
      testId="memory-settings"
      aside={
        <span className="text-xxs font-mono text-text-muted" data-testid="memory-status">
          {status ||
            (empty
              ? 'nothing remembered'
              : `${entries.length} line${entries.length === 1 ? '' : 's'}`)}
        </span>
      }
    >
      <div className="flex flex-col gap-3 text-xs">
        <p className="text-text-muted">
          Preferences, writing style and decisions you want the collaborator to remember across
          Cruxes. It adds a note only when you ask and shows you what it saved. You can edit or
          remove anything here.
        </p>
        <p className="text-text-muted">
          These notes accompany your conversations. Depending on your setup, they are sent through
          crux.garden or directly to your chosen model provider.
        </p>
        {mirrorPath && (
          <details className="text-text-muted">
            <summary className="cursor-pointer">Edit memory in another app</summary>
            <p className="mt-2">
              Open <code className="font-mono break-all">{mirrorPath}</code> in any text editor.
            </p>
          </details>
        )}

        <textarea
          aria-label="Memory"
          data-testid="memory-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            dirtyRef.current = true;
            setDirty(true);
          }}
          onBlur={() => void save()}
          disabled={busy}
          spellCheck={false}
          className={cn(
            'w-full bg-bg border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5',
            'text-xs text-text placeholder:text-placeholder font-mono leading-relaxed',
            'focus:outline-none focus:border-input-border-active resize-y min-h-[180px]',
          )}
        />

        {entries.length > 0 && (
          <ul className="flex flex-col divide-y divide-border" data-testid="memory-entries">
            {entries.map(({ section, line }) => (
              <li
                key={`${section}:${line}`}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <span className="min-w-0 truncate">
                  <span className="text-text-muted font-mono text-xxs mr-2">{section}</span>
                  {line.replace(/^- /, '')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Forget: ${line.replace(/^- /, '')}`}
                  disabled={busy || dirty}
                  onClick={() => void change(() => forgetMemoryLine(section, line))}
                >
                  Forget
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div role="alert" className="text-xs text-error">
            <p>{error}</p>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void reload()}>
              Reload memory
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void save()}
            disabled={!dirty || busy}
          >
            Save
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={empty || busy}
            onClick={async () => {
              // Forgetting everything is not a slip of the hand.
              if (
                await confirmDialog({
                  title: 'Clear memory',
                  message:
                    'Forget everything the collaborator remembers about you and your garden? Your projects are untouched.',
                  confirmLabel: 'Clear',
                  danger: true,
                })
              )
                await change(async () => {
                  await clearMemory();
                  const saved = getMemory();
                  baseline.current = saved;
                  setText(saved);
                  dirtyRef.current = false;
                  setDirty(false);
                });
            }}
          >
            Clear
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
