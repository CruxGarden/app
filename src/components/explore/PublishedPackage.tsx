import { useState } from 'react';
import type { Crux, Artifact } from '@/api/types';
import type { ExploreCrux } from '@/api/public';
import { publicApi } from '@/api';
import { Button } from '@/components/ui';
import { downloadBlob } from '@/lib/download';
import { pathOf } from '@/lib/artifact-path';
import PublishedCreationCard from './PublishedCreationCard';

/** A shared package link must work even when the visitor has no local Garden open. */
export default function PublishedPackage({
  crux,
  artifacts,
  username,
}: {
  crux: Crux;
  artifacts: Artifact[];
  username: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tool = crux.kind === 'tool';
  const extension = tool ? 'cruxtool' : 'cruxmood';
  const file = artifacts.find(
    (item) => pathOf(item) === (tool ? '_crux/tool-package.zip' : 'mood.cruxmood'),
  );
  const listing: ExploreCrux = {
    ...crux,
    author_username: username.replace(/^@/, ''),
    author_display_name: username.replace(/^@/, ''),
  };
  return (
    <section
      aria-label={tool ? 'Install this tool' : 'Install this Mood'}
      className="max-w-xl mx-auto p-6 space-y-4"
    >
      <h1 className="font-display text-2xl">{crux.title || crux.slug}</h1>
      <PublishedCreationCard crux={listing} onTag={() => {}} />
      <p className="text-sm text-text-muted">
        {tool
          ? 'An editor you can use to make your own Cruxes.'
          : 'A look and sound you can choose for your Garden.'}{' '}
        Download the file, then open Crux Garden → Add Crux → Import Crux, tool or Mood. AI is
        optional.
      </p>
      <Button
        disabled={!file || busy}
        loading={busy}
        onClick={() => {
          if (!file) return;
          setBusy(true);
          setError('');
          void publicApi
            .downloadArtifact(username, crux.slug, file.id)
            .then((blob) => downloadBlob(blob, `${crux.slug}.${extension}`))
            .catch((e) =>
              setError(e instanceof Error ? e.message : 'The download failed. Try again.'),
            )
            .finally(() => setBusy(false));
        }}
      >
        Download .{extension}
      </Button>
      {!file && (
        <p role="status" className="text-sm text-text-muted">
          This publication is missing its installable file. Its creator needs to publish it again.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </section>
  );
}
