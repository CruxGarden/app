import { useEffect } from 'react';
/** S3 SPA fallback: a clean docs URL must load its own built HTML, never a profile. */
export default function StaticPublication() {
  const path = window.location.pathname.replace(/\/$/, '');
  const target = `${path}/index.html${window.location.search}${window.location.hash}`;
  const missing = /\.[^/]+$/.test(path);
  useEffect(() => {
    if (!missing) window.location.replace(target);
  }, [missing, target]);
  return (
    <main className="p-8 text-text">
      <h1>{missing ? 'This page could not be found' : 'Opening the field guide…'}</h1>
      <a href={missing ? '/docs/index.html' : target}>Open the field guide</a>
    </main>
  );
}
