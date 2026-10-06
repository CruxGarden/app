import { lazy, Suspense, useEffect, useState } from 'react';
import { useSetupAgain } from './setup-store';

const SetupWizardDialog = lazy(() => import('./SetupWizardDialog'));

/** Loads the wizard the first time "Run setup again" is chosen, then keeps it for its exit. */
export default function SetupAgainHost() {
  const open = useSetupAgain((s) => s.open);
  const [wanted, setWanted] = useState(open);
  useEffect(() => {
    if (open) setWanted(true);
  }, [open]);
  if (!wanted && !open) return null;
  return (
    <Suspense fallback={null}>
      <SetupWizardDialog />
    </Suspense>
  );
}
