import { useCruxStore } from '@/stores/cruxStore';
import { useTurns } from '@/services/turns';
import { isVisualCrux } from '@/services/verify';
import { Capability, can } from '@/lib/platform';
import { Toggle } from '@/components/ui';

/**
 * Verify before done (ADR 0013 B4), the person's switch. It lived under the
 * composer, where two words could not say what was being checked (Daniel,
 * 2026-09-20: "useful feature but doesn't belong in the collaboration pane").
 * It belongs with the Crux's other settings, where there is room to say what
 * it does. The action itself — check it now — is in the Workshop toolbar,
 * beside Screenshot, because that is where you look at the result.
 *
 * Only shown where a check can happen: a visual crux on a platform that can
 * build and screenshot it.
 */
export default function CheckSettings() {
  const { setVerifyOnDone } = useTurns();
  const crux = useCruxStore((s) => s.crux);
  const visual = useCruxStore((s) => isVisualCrux(s.artifacts));
  const on = useCruxStore((s) => s.crux?.meta?.settings?.verifyOnDone !== false);
  const locked = useCruxStore((s) => s.closing || s.viewingSnapshotId !== null);
  if (!crux || !visual || !can(Capability.PreviewServer)) return null;
  return (
    <section className="p-3 border-b border-border space-y-2" aria-label="Checking the result">
      <Toggle
        label="Check when done"
        checked={on}
        disabled={locked}
        onChange={(next) => void setVerifyOnDone(next)}
      />
      <p className="text-xs text-text-muted">
        When a turn changes files and ends by saying it is finished, the Crux is built, its page is
        opened and looked at, and anything obviously wrong — a blank page, a missing heading, a
        broken script — comes back as one more turn to fix it. Use <em>Check it</em> in the Workshop
        to do it yourself at any time.
      </p>
    </section>
  );
}
