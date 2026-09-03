/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppStore } from '@/stores/appStore';
import App from './App';
import { dismissSplash } from '@/lib/splash';
import './styles/globals.css';

// Dropping a file or link onto a region with no drop handler makes the browser
// NAVIGATE the top-level document to it. In the desktop shell that would swap
// the app out from under the preload bridge, so refuse every unhandled drop —
// components that accept drops call preventDefault themselves and are
// unaffected (the listener runs at the document, after they handle it).
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

function isPublicRoute(): boolean {
  const path = window.location.pathname;
  // Gateway (/) renders immediately — it handles its own init via handleEnter
  if (path === '/') return true;
  return (
    path.startsWith('/explore') ||
    (!path.startsWith('/home') &&
      !path.startsWith('/settings') &&
      !path.startsWith('/c/') &&
      path.split('/').filter(Boolean).length >= 1)
  );
}


function Bootstrap() {
  const init = useAppStore((s) => s.init);
  const publicRoute = isPublicRoute();
  const [ready, setReady] = useState(() => publicRoute);

  useEffect(() => {
    if (ready) {
      // Dismiss splash once the app is ready to render.
      // Shell may also dismiss it after its own init, but this ensures
      // it's removed even if Shell's init encounters issues.
      dismissSplash();
      // Public routes: init auth in background (non-blocking) so tokens
      // get refreshed and crux:session handshake has a valid token.
      // Lightweight mode skips SQLite/services init.
      if (publicRoute) init({ lightweight: true }).catch(() => {});
      return;
    }
    init().then(() => setReady(true));
  }, [init, ready, publicRoute]);

  if (!ready) return null;
  return <App />;
}

createRoot(document.getElementById('root')!, {
  // Suppress Monaco editor disposal errors caught by EditorErrorBoundary.
  // @monaco-editor/react doesn't handle Strict Mode's effect double-invoke —
  // the editor's InstantiationService gets disposed on the first unmount and
  // fails to recreate on remount. The error boundary recovers silently.
  onCaughtError: (error) => {
    if (error instanceof Error && error.message.includes('InstantiationService has been disposed'))
      return;
    console.error(error);
  },
}).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);

// Suppress Monaco's async disposal errors (domNode, setClassName).
// These fire via setTimeout/rAF after the editor is disposed and can't be caught by React.
function isMonacoDisposalError(e: ErrorEvent | PromiseRejectionEvent): boolean {
  const err = 'reason' in e ? e.reason : e.error;
  const msg =
    (err instanceof Error ? err.message : String(err ?? '')) + ('message' in e ? e.message : '');
  const filename = 'filename' in e ? e.filename : '';
  const isMonacoFile = filename?.includes('monaco-editor') || filename?.includes('editor.api');
  const isMonacoMsg =
    msg.includes('domNode') || msg.includes('setClassName') || msg.includes('disposed');
  return isMonacoFile || isMonacoMsg;
}
window.addEventListener('error', (e) => {
  if (isMonacoDisposalError(e)) e.preventDefault();
});
window.addEventListener('unhandledrejection', (e) => {
  if (isMonacoDisposalError(e)) e.preventDefault();
});

// Preview system initialization:
// - Cross-origin (VITE_PREVIEW_ORIGIN set): load hidden receiver iframe on preview.crux.garden
//   The receiver registers its own SW. No same-origin SW needed.
// - Same-origin (no VITE_PREVIEW_ORIGIN): register SW on this origin (local dev fallback)
if (import.meta.env.VITE_PREVIEW_ORIGIN) {
  import('@/lib/previewCache').then(({ initPreviewReceiver }) => initPreviewReceiver());
} else if ('serviceWorker' in navigator && navigator.serviceWorker) {
  navigator.serviceWorker.register('/preview-sw.js').catch(() => {});
}
