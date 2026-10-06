import { lazy, Suspense, useEffect, useState } from 'react';
import { useGardenContext } from '@/stores/gardenContext';
const NewCruxModal = lazy(() => import('./NewCruxModal'));

/** Requests survive early launch and renderer reload until the person handles them. */
export default function PendingPackageImports() {
  const bridge = window.electronAPI?.packageImports;
  const garden = useGardenContext((s) => s.garden);
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const refresh = () => {
      void bridge
        .pending()
        .then((items) => {
          if (active) {
            setItems(items);
            setError('');
          }
        })
        .catch(() => {
          if (active) setError('Could not open the requested package.');
        });
    };
    const stop = bridge.onChange(refresh);
    refresh();
    return () => {
      active = false;
      stop();
    };
  }, [bridge, retry]);
  const next = items[0];
  if (!bridge || !garden) return null;
  if (error)
    return (
      <div role="alert">
        {error} <button onClick={() => setRetry(retry + 1)}>Retry</button>
      </div>
    );
  if (!next) return null;
  return (
    <Suspense fallback={<p role="status">Opening package…</p>}>
      <NewCruxModal
        key={next.id}
        open
        onClose={() => {
          void bridge.dismiss(next.id).catch(() => setError('Could not dismiss this file.'));
        }}
        requestedImport={{
          name: next.name,
          read: async () => {
            const bytes = await bridge.read(next.id);
            return new File([bytes as BlobPart], next.name, { type: 'application/zip' });
          },
        }}
      />
    </Suspense>
  );
}
