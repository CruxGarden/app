/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppStore } from '@/stores/appStore';
import App from './App';
import { dismissSplash } from '@/lib/splash';
import './styles/globals.css';
import { isPublicSite } from '@/lib/site';

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

// Suppress Monaco's async disposal errors (domNode, setClassName). These fire
// via setTimeout/rAF after the editor is disposed and cannot be caught by
// React. The test is for the disposal *shape*, not for Monaco: swallowing
// everything a Monaco chunk throws, or every message containing the word
// "disposed", hides real faults — including Monaco's own.
const DISPOSAL_SHAPE =
  /InstantiationService has been disposed|reading '?domNode'?|\.domNode\b|setClassName/;
function isMonacoDisposalError(e: ErrorEvent | PromiseRejectionEvent): boolean {
  const err = 'reason' in e ? e.reason : e.error;
  const msg =
    (err instanceof Error ? err.message : String(err ?? '')) + ('message' in e ? e.message : '');
  return DISPOSAL_SHAPE.test(msg);
}
function suppressDisposal(e: ErrorEvent | PromiseRejectionEvent): boolean {
  if (!isMonacoDisposalError(e)) return false;
  // Quiet, but not invisible: a run of these is worth seeing in the console.
  console.debug('[monaco] disposal error suppressed:', 'reason' in e ? e.reason : e.error);
  e.preventDefault();
  return true;
}
window.addEventListener('error', suppressDisposal);
window.addEventListener('unhandledrejection', suppressDisposal);

// Preview system initialization:
// - Cross-origin (VITE_PREVIEW_ORIGIN set): load hidden receiver iframe on preview.crux.garden
//   The receiver registers its own SW. No same-origin SW needed.
// - Same-origin (no VITE_PREVIEW_ORIGIN): register SW on this origin (local dev fallback)
// The teaser has no crux to preview, so it does not pay for the receiver.
// waitForReceiver brings it up on first use if a later route needs one.
const TEASER_PATHS = ['/', '/subscribed'];
const needsPreview = !(isPublicSite() && TEASER_PATHS.includes(window.location.pathname));

if (import.meta.env.VITE_PREVIEW_ORIGIN && needsPreview) {
  import('@/lib/previewCache').then(({ initPreviewReceiver }) => initPreviewReceiver());
} else if (
  !import.meta.env.VITE_PREVIEW_ORIGIN &&
  'serviceWorker' in navigator &&
  navigator.serviceWorker
) {
  navigator.serviceWorker.register('/preview-sw.js').catch(() => {});
}
