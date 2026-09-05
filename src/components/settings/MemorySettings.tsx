import { useCallback, useEffect, useState } from 'react';
import { Panel, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
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
  const [mirrorPath, setMirrorPath] = useState<string | null>(null);
  const desktop = can(Capability.ProjectFolder);

  // Adopt an outside edit of the desktop mirror when the panel opens; follow
  // writes made elsewhere (the `remember` tool) while it is open.
  useEffect(() => {
    let live = true;
    syncMemoryFromDisk().then((t) => {
      if (live) setText(t);
    });
    if (desktop) {
      getGardenRoot().then((root) => {
        if (live && root) setMirrorPath(shortenHomePath(`${root}/${MEMORY_FILE}`));
      });
    }
    const off = onMemoryChanged((t) => {
      if (live) {
        setText(t);
        setDirty(false);
      }
    });
    return () => {
      live = false;
      off();
    };
  }, [desktop]);

  const save = useCallback(async () => {
    if (!dirty) return;
    const saved = await setMemory(text);
    setText(saved);
    setDirty(false);
    setStatus('Saved');
    setTimeout(() => setStatus(''), 1500);
  }, [dirty, text]);

  const entries = memoryEntries(text);
  const empty = isMemoryEmpty(text);

  return (
    <Panel padding="md" data-testid="memory-settings">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display text-sm font-medium text-accent">Memory</h2>
        <span className="text-xxs font-mono text-text-muted" data-testid="memory-status">
          {status ||
            (empty
              ? 'nothing remembered'
              : `${entries.length} line${entries.length === 1 ? '' : 's'}`)}
        </span>
      </div>

      <div className="flex flex-col gap-3 text-xs">
        <p className="text-text-muted">
          What the collaborator knows about you across every crux — your preferences, voice and
          decisions. It is one small file you can edit here; the collaborator adds a line only when
          you ask it to remember something, and shows you what it saved. It is sent with every
          conversation and never leaves this machine except to the model provider you chose.
          {mirrorPath ? (
            <>
              {' '}
              Also on disk at <code className="font-mono">{mirrorPath}</code> — edit it in any
              editor.
            </>
          ) : null}
        </p>

        <textarea
          aria-label="Memory"
          data-testid="memory-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          onBlur={save}
          spellCheck={false}
          className={cn(
            'w-full bg-bg border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5',
            'text-xs text-text placeholder:text-text-muted/50 font-mono leading-relaxed',
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
                  onClick={() => forgetMemoryLine(section, line)}
                >
                  Forget
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={save} disabled={!dirty}>
            Save
          </Button>
          <Button variant="danger" size="sm" onClick={() => clearMemory()} disabled={empty}>
            Clear
          </Button>
        </div>
      </div>
    </Panel>
  );
}
