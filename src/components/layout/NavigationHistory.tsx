import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import IconButton from '@/components/ui/IconButton';
import { ArrowLeftIcon } from '@/components/ui/icons';

// Observe the browser's history; do not maintain a second stack of routes or
// guess Forward availability from history.length. React Router owns traversal.
interface BrowserNavigation extends EventTarget {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}
const navigation = (window as unknown as { navigation?: BrowserNavigation }).navigation;
const subscribe = (changed: () => void) => {
  navigation?.addEventListener('currententrychange', changed);
  return () => navigation?.removeEventListener('currententrychange', changed);
};
const canGoBack = () => navigation?.canGoBack ?? false;
const canGoForward = () => navigation?.canGoForward ?? false;

export default function NavigationHistory() {
  const back = useSyncExternalStore(subscribe, canGoBack);
  const forward = useSyncExternalStore(subscribe, canGoForward);
  const navigate = useNavigate();
  // Older browser hosts retain their native controls. The packaged desktop
  // supports this capability, including reload and platform history gestures.
  if (!navigation) return null;
  return (
    <div className="flex shrink-0" role="group" aria-label="Navigation history">
      <IconButton
        label="Back"
        size="sm"
        tooltip={{ label: 'Back' }}
        disabled={!back}
        className="disabled:opacity-30"
        onClick={() => {
          void navigate(-1);
        }}
      >
        <ArrowLeftIcon />
      </IconButton>
      <IconButton
        label="Forward"
        size="sm"
        tooltip={{ label: 'Forward' }}
        disabled={!forward}
        className="disabled:opacity-30"
        onClick={() => {
          void navigate(1);
        }}
      >
        <span className="rotate-180">
          <ArrowLeftIcon />
        </span>
      </IconButton>
    </div>
  );
}
