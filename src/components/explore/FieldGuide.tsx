import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@/components/ui';
import { Capability, can } from '@/lib/platform';
import { captureGardenId, inGarden } from '@/stores/gardenContext';
import type { Crux } from '@/api/types';
import { getServices } from '@/services';
import { useUIStore } from '@/stores/uiStore';
import { applyTemplateToCrux } from '@/services/crux-create';

import { useFieldGuide } from '@/stores/fieldGuide';
import { openSetupAgain } from '@/components/setup/setup-store';

/** One reader for the bundled publication; closing restores the current workspace. */
export default function FieldGuide() {
  const { page, close } = useFieldGuide();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draft = useRef<Crux | null>(null);
  const working = useRef(false);
  const draftGarden = useRef<ReturnType<typeof captureGardenId>>(null);
  const navigate = useNavigate();
  async function copy() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    const gardenId = draft.current ? draftGarden.current : captureGardenId();
    draftGarden.current = gardenId;
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
      close();
      navigate(inGarden(`/c/${crux.id}`, gardenId ?? undefined));
      draft.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make your copy. Try again.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open={page !== null}
      onClose={close}
      size="full"
      title="Field guide"
      subtitle="Bundled with your app · Read offline, or make an editable Crux of your own"
      flush
    >
      <iframe
        title="Crux Garden documentation"
        src={`/docs/${page ?? ''}index.html`}
        className="w-full flex-1 min-h-0 rounded-lg border border-border bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
      <div className="pt-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-text-muted">
          Your copy has its own Artifacts, Growth and Share.
        </p>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            close();
            openSetupAgain();
          }}
        >
          Run setup again
        </Button>
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
  );
}
