import { useMemo, useState } from 'react';
import type { Artifact } from '@/api/types';
import { pathOf } from '@/lib/artifact-path';
import { useCruxStore } from '@/stores/cruxStore';
import {
  addGuestbook,
  guestbookPlacement,
  guestbookSnippet,
  hasGuestbook,
  GUESTBOOK_KEY,
} from '@/services/guestbook';
import { PaneSection, PaneAction, PaneHint, PaneNote } from './pane-ui';

/**
 * The guestbook block (V1-GAPS-PLAN §2.8) from the Share pane — the UI twin
 * of the `add_guestbook` tool: visitors of the shared site leave a note, kept
 * in this Crux's own Crux Store under the public key `guestbook`.
 */
export default function GuestbookSection({
  cruxId,
  artifacts,
}: {
  cruxId: string;
  artifacts: Artifact[];
}) {
  const refreshArtifacts = useCruxStore((s) => s.refreshArtifacts);
  const paths = useMemo(() => artifacts.map((a) => pathOf(a)), [artifacts]);
  const placement = useMemo(() => guestbookPlacement(paths), [paths]);
  const present = hasGuestbook(paths);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await addGuestbook(cruxId);
      await refreshArtifacts();
      setNote(
        r.pagePath
          ? r.inserted
            ? `Added to ${r.pagePath}.`
            : `${r.pagePath} already carried the block.`
          : `Script written. Put this where the book should appear:\n${r.snippet}`,
      );
    } catch (err) {
      setError((err as Error).message || 'Could not add the guestbook.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PaneSection label="Guestbook">
      <div className="flex flex-col gap-1.5">
        {present ? (
          <>
            <span className="text-xxs text-text">
              {placement.pagePath
                ? `On ${placement.pagePath}`
                : `${placement.scriptPath} is in the Crux`}
            </span>
            {!placement.pagePath && (
              <pre className="text-xxs text-text-muted whitespace-pre-wrap break-all font-mono">
                {guestbookSnippet(placement)}
              </pre>
            )}
            <span className="text-xxs text-text-muted">
              Visitors sign in by email on the shared site and leave a note. Entries are in the
              Store pane under “{GUESTBOOK_KEY}”.
            </span>
          </>
        ) : (
          <>
            <PaneAction onClick={add} busy={busy ? 'Adding…' : undefined} tone="secondary">
              Add a guestbook
            </PaneAction>
            <PaneHint align="left">
              A section where visitors leave a note, kept in this Crux&apos;s Store. Goes at the end
              of {placement.pagePath ?? 'the page you put it on'}.
            </PaneHint>
          </>
        )}
        {note && (
          <span role="status" className="text-xxs text-text-muted whitespace-pre-wrap">
            {note}
          </span>
        )}
        {error && <PaneNote tone="error">{error}</PaneNote>}
      </div>
    </PaneSection>
  );
}
