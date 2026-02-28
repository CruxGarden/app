import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useAuthStore } from '@/stores/authStore';
import App from './App';
import './styles/globals.css';

function Bootstrap() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return <App />;
}

createRoot(document.getElementById('root')!, {
  // Suppress Monaco editor disposal errors caught by EditorErrorBoundary.
  // @monaco-editor/react doesn't handle Strict Mode's effect double-invoke —
  // the editor's InstantiationService gets disposed on the first unmount and
  // fails to recreate on remount. The error boundary recovers silently.
  onCaughtError: (error) => {
    if (error instanceof Error && error.message.includes('InstantiationService has been disposed')) return;
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

// Register preview service worker (serves cached artifact files for HTML preview)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/preview-sw.js').catch(() => {});
}
