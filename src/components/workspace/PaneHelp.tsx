import { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { useAdvancedMode } from '@/hooks/useAdvancedMode';
import { PANES, type PaneType } from './paneConfig';
import { openFieldGuide } from '@/stores/fieldGuide';
export default function PaneHelp({ pane, label }: { pane: PaneType; label: string }) {
  const [open, setOpen] = useState(false);
  const advanced = useAdvancedMode();
  return (
    <>
      <button
        type="button"
        aria-label={`Help with ${label}`}
        className="text-xs text-text-muted hover:text-accent px-1"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        ?
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Help with ${label}`} size="sm">
        <p className="text-sm text-text">
          {PANES[pane].layouts[advanced ? 'advanced' : 'normal'].guidance}
        </p>
        <p className="text-xs text-text-muted mt-3">
          {advanced
            ? 'Advanced Mode shows the detailed controls.'
            : 'Normal mode keeps the everyday controls within reach. Extra controls, where available, sit in named sections.'}{' '}
          Change this across the app in Settings → Getting started. Your work is kept when you
          switch.
        </p>
        <Button
          className="mt-3"
          onClick={() => {
            setOpen(false);
            openFieldGuide(pane === 'publish' ? 'guides/sharing/' : 'start/get-started/');
          }}
        >
          Open step-by-step help
        </Button>
      </Modal>
    </>
  );
}
