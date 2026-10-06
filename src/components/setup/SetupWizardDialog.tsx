import { Modal } from '@/components/ui';
import SetupWizard from './SetupWizard';
import { abandonSetup } from './setup-actions';
import { closeSetupAgain, useSetupAgain } from './setup-store';

/**
 * "Run setup again" (Settings → Garden and backups, Help): the same wizard over
 * the app, starting from today's choices. Closing it changes nothing.
 */
export default function SetupWizardDialog() {
  const open = useSetupAgain((s) => s.open);
  return (
    <Modal
      open={open}
      onClose={() => {
        void abandonSetup();
        closeSetupAgain();
      }}
      title="Run setup again"
      size="lg"
      className="max-h-[calc(100vh-6rem)]"
    >
      {open && <SetupWizard mode="again" onCancel={closeSetupAgain} onDone={closeSetupAgain} />}
    </Modal>
  );
}
