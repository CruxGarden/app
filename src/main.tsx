/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAuthStore } from '@/stores/authStore';
import App from './App';
import './styles/globals.css';

function Bootstrap() {
  const init = useAuthStore((s) => s.init);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    init().then(() => setReady(true));
  }, [init]);

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
window.addEventListener('error', (e) => {
  if (e.filename?.includes('monaco-editor') || e.filename?.includes('editor.api')) {
    const msg = e.message || '';
    if (msg.includes('domNode') || msg.includes('setClassName') || msg.includes('disposed')) {
      e.preventDefault();
    }
  }
});

// Preview system initialization:
// - Cross-origin (VITE_PREVIEW_ORIGIN set): load hidden receiver iframe on preview.crux.garden
//   The receiver registers its own SW. No same-origin SW needed.
// - Same-origin (no VITE_PREVIEW_ORIGIN): register SW on this origin (local dev fallback)
if (import.meta.env.VITE_PREVIEW_ORIGIN) {
  import('@/lib/previewCache').then(({ initPreviewReceiver }) => initPreviewReceiver());
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/preview-sw.js').catch(() => {});
}
