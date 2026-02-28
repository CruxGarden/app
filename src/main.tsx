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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);

// Register preview service worker (serves cached artifact files for HTML preview)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/preview-sw.js').catch(() => {});
}
