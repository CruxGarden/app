import { getSqliteClient } from '@/services/sqlite/client';
import { useEffect, useState, useId } from 'react';
import {
  archiveRuntimeMode,
  rememberRuntimeMode,
  estimateRuntimeFiles,
  type RuntimeMode,
} from '@/services/archive-runtimes';
import { formatBytes } from '@/lib/format';
import type { Artifact } from '@/api/types';

export default function RuntimeExportChoice({
  template,
  artifacts,
  disabled = false,
}: {
  template?: string;
  artifacts?: Artifact[];
  disabled?: boolean;
}) {
  if (getSqliteClient().fileContent)
    return (
      <p className="text-xs text-text-muted">
        Includes files, tools, conversation, Tasks and Growth. This private backup is
        self-contained.
      </p>
    );
  return <RuntimeChoice template={template} artifacts={artifacts} disabled={disabled} />;
}

function RuntimeChoice({
  template,
  artifacts,
  disabled,
}: {
  template?: string;
  artifacts?: Artifact[];
  disabled: boolean;
}) {
  const group = useId();
  const [mode, setMode] = useState(archiveRuntimeMode);
  useEffect(() => {
    const update = () => setMode(archiveRuntimeMode());
    window.addEventListener('archive:runtime-mode', update);
    return () => window.removeEventListener('archive:runtime-mode', update);
  }, []);
  const [sizes, setSizes] = useState<{ included: number; reference: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSizes(null);
    if (artifacts)
      void estimateRuntimeFiles(template, artifacts)
        .then((next) => {
          if (!cancelled) setSizes(next);
        })
        .catch(() => {
          /* Estimates are optional; export reports any actual failure. */
        });
    return () => {
      cancelled = true;
    };
  }, [template, artifacts]);
  const choose = (value: RuntimeMode) => {
    setMode(value);
    rememberRuntimeMode(value);
  };
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2 text-xs">
      <legend className="mb-2 text-text">Tool files</legend>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          name={group}
          type="radio"
          checked={mode === 'reference'}
          onChange={() => choose('reference')}
        />
        By reference{sizes && ` · ${formatBytes(sizes.reference)}`}
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          name={group}
          type="radio"
          checked={mode === 'included'}
          onChange={() => choose('included')}
        />
        Include tools{sizes && ` · ${formatBytes(sizes.included)}`}
      </label>
      <p className="text-xxs text-text-muted">
        {mode === 'reference'
          ? 'Smaller archive; opening it needs the matching tools installed.'
          : 'Self-contained archive with the tool files included.'}{' '}
        Your content and modified tool files are always included.
        {sizes &&
          ' Sizes show current files before compression; history and archive metadata add to them.'}
      </p>
    </fieldset>
  );
}
