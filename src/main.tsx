/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAuthStore } from '@/stores/authStore';
import App from './App';
import './styles/globals.css';

function isAppRoute(): boolean {
  const path = window.location.pathname;
  return path.startsWith('/home') || path.startsWith('/c/') || path.startsWith('/settings');
}

function isPublicRoute(): boolean {
  const path = window.location.pathname;
  return (
    path.startsWith('/discover') ||
    (!path.startsWith('/home') &&
     !path.startsWith('/login') &&
     !path.startsWith('/settings') &&
     !path.startsWith('/c/') &&
     path !== '/' &&
     path.split('/').filter(Boolean).length >= 1)
  );
}

function dismissSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 300);
}

function Bootstrap() {
  const init = useAuthStore((s) => s.init);
  const [ready, setReady] = useState(() => isPublicRoute());

  useEffect(() => {
    if (ready) {
      // Non-app routes don't go through AppShell, so dismiss splash here.
      // App routes (/home, /c/, /settings) dismiss splash in AppShell after services init.
      if (!isAppRoute()) dismissSplash();
      // Public routes: init auth in background (non-blocking) so tokens
      // get refreshed and crux:session handshake has a valid token.
      // Lightweight mode skips SQLite/services init.
      if (isPublicRoute()) init({ lightweight: true }).catch(() => {});
      return;
    }
    init().then(() => setReady(true));
  }, [init, ready]);

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
  const msg = (err instanceof Error ? err.message : String(err ?? '')) + ('message' in e ? e.message : '');
  const filename = 'filename' in e ? e.filename : '';
  const isMonacoFile = filename?.includes('monaco-editor') || filename?.includes('editor.api');
  const isMonacoMsg = msg.includes('domNode') || msg.includes('setClassName') || msg.includes('disposed');
  return isMonacoFile || isMonacoMsg;
}
window.addEventListener('error', (e) => { if (isMonacoDisposalError(e)) e.preventDefault(); });
window.addEventListener('unhandledrejection', (e) => { if (isMonacoDisposalError(e)) e.preventDefault(); });

// Preview system initialization:
// - Cross-origin (VITE_PREVIEW_ORIGIN set): load hidden receiver iframe on preview.crux.garden
//   The receiver registers its own SW. No same-origin SW needed.
// - Same-origin (no VITE_PREVIEW_ORIGIN): register SW on this origin (local dev fallback)
if (import.meta.env.VITE_PREVIEW_ORIGIN) {
  import('@/lib/previewCache').then(({ initPreviewReceiver }) => initPreviewReceiver());
} else if ('serviceWorker' in navigator && navigator.serviceWorker) {
  navigator.serviceWorker.register('/preview-sw.js').catch(() => {});
}
