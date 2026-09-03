import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import {
  assetRef,
  getAssets,
  importAssetFile,
  onAssetsChange,
  removeAsset,
  type MoodAsset,
} from '@/lib/moods/assets';
import {
  applyActiveMood,
  getThemeOverrides,
  resolvedSection,
  setThemeOverrides,
} from '@/lib/moods/active';
import { useAudioStore } from '@/stores/audioStore';
import { createLayer } from '@/audio/schema';

/**
 * The Assets tab: files you bring into your Mood — images for backgrounds,
 * textures and covers; audio for music and sample layers; fonts for the type.
 * Each file is one action away from being used, and every use is a token or
 * a layer, so it travels with the Mood Package.
 */

const PANES = [
  ['Collaboration', 'paneCollaboration'],
  ['Artifacts', 'paneArtifacts'],
  ['Workshop', 'paneWorkshop'],
  ['Metadata', 'paneDetails'],
  ['History', 'paneHistory'],
  ['Export', 'paneExport'],
  ['Sync', 'paneSync'],
  ['Share', 'panePublish'],
  ['Store', 'paneStore'],
] as const;

function Thumb({ asset }: { asset: MoodAsset }) {
  const url = useBlobUrl(asset.kind === 'image' ? asset.fingerprint : undefined, asset.type);
  if (asset.kind === 'image' && url) {
    return <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-[10px] font-mono uppercase text-text-muted bg-surface">
      {asset.kind}
    </div>
  );
}

export default function AssetsTab() {
  const [assets, setAssets] = useState<MoodAsset[]>(() => getAssets());
  useEffect(() => onAssetsChange(() => setAssets(getAssets())), []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [paneFor, setPaneFor] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const say = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(null), 4000);
  };

  const setToken = (key: string, value: string) => {
    const section = resolvedSection();
    setThemeOverrides(section, { ...getThemeOverrides(section), [key]: value });
    applyActiveMood(section);
  };

  const add = async (files: FileList | File[]) => {
    setBusy(true);
    try {
      let n = 0;
      for (const f of Array.from(files)) {
        await importAssetFile(f);
        n += 1;
      }
      say(`Added ${n} file${n === 1 ? '' : 's'}.`);
    } finally {
      setBusy(false);
    }
  };

  const makeBackground = async (a: MoodAsset) => {
    const { setBackgroundImage } = await import('@/services/background');
    await setBackgroundImage(a.fingerprint);
    say(`"${a.name}" is the background.`);
  };
  const addMusicLayer = async (a: MoodAsset, type: 'music' | 'sample') => {
    const s = useAudioStore.getState();
    if (!s.mixes.length) s.init();
    const st = useAudioStore.getState();
    const mix = st.mixes.find((m) => m.id === st.activeMixId);
    if (!mix) return;
    const layer = createLayer(type, {
      name: a.name.replace(/\.[^.]+$/, ''),
      gain: -10,
      params: { fingerprint: a.fingerprint, fileName: a.name },
    });
    await st.upsertMix({ ...mix, layers: [...mix.layers, layer] });
    say(`Added "${layer.name}" as a ${type} layer to "${mix.name}".`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'rounded-[var(--radius)] border border-dashed border-border/70 p-5 text-center transition-colors',
          busy && 'opacity-60',
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void add(e.dataTransfer.files);
        }}
      >
        <p className="text-sm text-heading">Bring your own files</p>
        <p className="text-xs text-text-muted mt-1 mb-3">
          Images for backgrounds, textures and covers · audio for music and sample layers · fonts
          (.woff2, .ttf) for the type. They live in your garden and travel inside the Mood Package.
        </p>
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Adding…' : 'Add files'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,audio/*,.woff,.woff2,.ttf,.otf"
          className="hidden"
          aria-label="Add asset files"
          onChange={(e) => {
            if (e.target.files?.length) void add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {note && (
        <p role="status" className="text-[11px] text-accent">
          {note}
        </p>
      )}

      {assets.length > 0 && (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {assets.map((a) => (
            <div
              key={a.fingerprint}
              className="rounded-[var(--radius)] border border-border bg-panel overflow-hidden flex flex-col"
              data-testid={`asset-${a.fingerprint}`}
            >
              <div className="aspect-[16/9] w-full overflow-hidden border-b border-border bg-garden-card-thumbnail">
                <Thumb asset={a} />
              </div>
              <div className="p-2.5 flex flex-col gap-1.5">
                <div className="min-w-0">
                  <div className="text-xs font-body text-text truncate" title={a.name}>
                    {a.name}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted truncate">
                    {a.kind} · {formatBytes(a.size)} ·{' '}
                    <span title={a.fingerprint}>{assetRef(a.fingerprint.slice(0, 8))}…</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {a.kind === 'image' && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => void makeBackground(a)}>
                        Background
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setToken('workspaceTexture', assetRef(a.fingerprint));
                          say(
                            `"${a.name}" is the workspace texture — tune it under Textures & grain.`,
                          );
                        }}
                      >
                        Workspace texture
                      </Button>
                      <div className="flex items-center gap-1">
                        <select
                          aria-label={`Pane for ${a.name}`}
                          value={paneFor[a.fingerprint] ?? 'paneWorkshop'}
                          onChange={(e) =>
                            setPaneFor({ ...paneFor, [a.fingerprint]: e.target.value })
                          }
                          className="h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 text-[11px] text-text"
                        >
                          {PANES.map(([label, key]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const key = paneFor[a.fingerprint] ?? 'paneWorkshop';
                            setToken(`${key}Texture`, assetRef(a.fingerprint));
                            say(`"${a.name}" textures that pane.`);
                          }}
                        >
                          Pane texture
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSetting(SettingsKey.MoodCover, a.fingerprint);
                          say(`"${a.name}" will be the cover of the next Mood you save.`);
                        }}
                      >
                        Cover
                      </Button>
                    </>
                  )}
                  {a.kind === 'audio' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void addMusicLayer(a, 'music')}
                      >
                        Music layer
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void addMusicLayer(a, 'sample')}
                      >
                        Sample layer
                      </Button>
                    </>
                  )}
                  {a.kind === 'font' &&
                    (
                      [
                        ['Display', 'fontFaceDisplay', 'fontDisplay', 'MoodFontDisplay'],
                        ['Body', 'fontFaceBody', 'fontBody', 'MoodFontBody'],
                        ['Code', 'fontFaceMono', 'fontMono', 'MoodFontMono'],
                      ] as const
                    ).map(([label, faceKey, fontKey, family]) => (
                      <Button
                        key={faceKey}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const section = resolvedSection();
                          setThemeOverrides(section, {
                            ...getThemeOverrides(section),
                            [faceKey]: assetRef(a.fingerprint),
                            [fontKey]: `'${family}', ${fontKey === 'fontMono' ? 'monospace' : 'sans-serif'}`,
                          });
                          applyActiveMood(section);
                          say(`"${a.name}" is now the ${label.toLowerCase()} face.`);
                        }}
                      >
                        {label} font
                      </Button>
                    ))}
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(assetRef(a.fingerprint))}
                    className="h-8 px-2 text-[10px] font-mono text-text-muted hover:text-text cursor-pointer"
                    title="Copy the token value (use it in any texture/font-face token)"
                  >
                    copy asset:…
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAsset(a.fingerprint)}
                    aria-label={`Remove asset ${a.name}`}
                    className="ml-auto text-text-muted hover:text-error text-sm px-1 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
