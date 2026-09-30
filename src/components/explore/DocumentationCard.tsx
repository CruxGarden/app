import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, buttonClass } from '@/components/ui';
import { Capability, can } from '@/lib/platform';
import { captureGardenId, inGarden } from '@/stores/gardenContext';
import type { Crux } from '@/api/types';
import { getServices } from '@/services';
import { useUIStore } from '@/stores/uiStore';
import { applyTemplateToCrux } from '@/services/crux-create';

/** A cached publication and its editable source share one ordinary template. */
export default function DocumentationCard({ local }: { local: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draft = useRef<Crux | null>(null);
  const working = useRef(false);
  const navigate = useNavigate();
  async function copy() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    const gardenId = captureGardenId();
    try {
      const crux = (draft.current ??= await getServices().crux.create({
        title: 'My Field Guide',
        type: 'workspace',
        kind: 'webapp',
        ...(gardenId ? { gardenId } : {}),
        meta: { messages: [] },
      }));
      await applyTemplateToCrux(crux, 'documentation', 'webapp');
      useUIStore.getState().seedCruxLayout(crux.id, 22);
      setOpen(false);
      navigate(inGarden(`/c/${crux.id}`, gardenId));
      draft.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make your copy. Try again.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <section
        aria-label="Crux Garden field guide"
        className="mb-4 rounded-[var(--radius)] border border-border bg-panel p-4 @md:p-5"
      >
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="shrink-0 flex h-12 w-12 items-center justify-center rounded-full border border-accent/40 text-3xl font-light text-accent"
          >
            +
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-2xs tracking-widest uppercase text-accent mb-1">A place to start</p>
            <h3 className="font-display text-lg text-text">A little guidance. Room to grow.</h3>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              Make your first page, keep its history, and learn to work with Tasks.
            </p>
            <div className="mt-3 flex items-center flex-wrap gap-3">
              {local ? (
                <Button size="sm" onClick={() => setOpen(true)}>
                  Read the field guide →
                </Button>
              ) : (
                <a className={buttonClass('primary', 'sm')} href="/docs/">
                  Read the field guide →
                </a>
              )}
              <span className="text-2xs text-text-muted">
                {local ? 'Available offline · No AI needed' : 'Start small. Make it yours.'}
              </span>
            </div>
          </div>
        </div>
      </section>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="full"
        title="Field guide"
        subtitle="Bundled with your app · Read offline, or make an editable Crux of your own"
        flush
      >
        <iframe
          title="Crux Garden documentation"
          src="/docs/index.html"
          className="w-full flex-1 min-h-0 rounded-lg border border-border bg-white"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
        <div className="pt-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-text-muted">
            Your copy has its own Artifacts, Growth and Share.
          </p>
          {can(Capability.Build) && (
            <Button size="sm" onClick={() => void copy()} disabled={busy}>
              {busy ? 'Making your copy…' : 'Make a copy'}
            </Button>
          )}
          {error && (
            <p role="alert" className="w-full text-sm text-red-400">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
