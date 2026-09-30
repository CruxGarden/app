import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui';
import { useCruxStoreApi } from '@/stores/cruxStore';

/** Upload into this project's Artifacts, then use its public path in the form. */
export default function TemplateImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const store = useCruxStoreApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = useRef(onChange);
  change.current = onChange;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const upload = async (file?: File) => {
    if (!file || busy) return;
    const extension: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    if (!extension[file.type] || file.size > 10 * 1024 * 1024) {
      setError('Choose a PNG, JPEG, WebP or GIF up to 10 MB.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      // Fresh filenames preserve the old photo and its version history.
      const name = `photo-${crypto.randomUUID()}.${extension[file.type]}`;
      await store
        .getState()
        .uploadFile(new File([file], name, { type: file.type }), 'public/images');
      if (mounted.current) change.current(`/images/${name}`);
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error ? failure.message : 'Photo could not be saved. Try again.',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <label className="block text-xs text-text-muted">
        {label}
        <Input
          value={value}
          disabled={busy}
          placeholder="Image path or URL"
          onChange={(event) => onChange(event.target.value)}
          fieldSize="sm"
        />
      </label>
      <label className="block text-xs text-text-muted">
        Upload {label.toLowerCase()}
        <input
          className="block mt-1 text-xs max-w-full"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={busy}
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      {busy && (
        <p role="status" className="text-xs text-text-muted">
          Saving photo…
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
