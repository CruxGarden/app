import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import { useAudioStore } from '@/stores/audioStore';
import { useShallow } from 'zustand/react/shallow';
import {
  CUE_EVENTS,
  CUE_KINDS,
  getCues,
  saveCues,
  type CueEvent,
  type CueKind,
  type SoundCues,
} from '@/services/cues';
import {
  LAYER_LABELS,
  LAYER_TYPES,
  SCALES,
  createLayer,
  createMix,
  newId,
  type Effect,
  type EffectType,
  type Layer,
  type LayerType,
  type Mix,
} from '@/audio/schema';
import {
  EFFECT_DEFAULTS,
  EFFECT_META,
  PARAM_META,
  ROOTS,
  type ParamMeta,
} from '@/audio/params-meta';

/**
 * The Resonance tab of the Mood Builder — the mixer. Left: the Mixes. Right:
 * the selected Mix as layer strips with parameters and effect racks. Every
 * change goes straight to the store, which persists it and updates the live
 * engine in place, so you hear what you edit.
 */

function ParamControl({
  id,
  meta,
  value,
  onChange,
}: {
  id: string;
  meta: ParamMeta;
  value: number | string | boolean | undefined;
  onChange: (v: number | string | boolean) => void;
}) {
  if (meta.kind === 'range') {
    const v = typeof value === 'number' ? value : meta.min;
    return (
      <label className="flex items-center gap-2 text-[11px]">
        <span className="w-24 shrink-0 text-text-muted truncate">{meta.label}</span>
        <input
          type="range"
          aria-label={id}
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={v}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-accent"
        />
        <span className="w-14 text-right font-mono text-text-muted">
          {meta.step >= 1 ? v.toFixed(0) : v.toFixed(2)}
          {meta.unit ?? ''}
        </span>
      </label>
    );
  }
  if (meta.kind === 'select') {
    return (
      <label className="flex items-center gap-2 text-[11px]">
        <span className="w-24 shrink-0 text-text-muted truncate">{meta.label}</span>
        <select
          aria-label={id}
          value={String(value ?? meta.options[0]!.value)}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[11px] text-text"
        >
          {meta.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (meta.kind === 'toggle') {
    return (
      <label className="flex items-center gap-2 text-[11px] cursor-pointer">
        <span className="w-24 shrink-0 text-text-muted truncate">{meta.label}</span>
        <input
          type="checkbox"
          aria-label={id}
          checked={value !== false}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-accent"
        />
      </label>
    );
  }
  return null;
}

function FileParam({
  layer,
  onPick,
}: {
  layer: Layer;
  onPick: (fingerprint: string, fileName: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const name = String(layer.params.fileName || '');
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-24 shrink-0 text-text-muted">Audio file</span>
      <span className="flex-1 truncate font-mono text-text">{name || 'none'}</span>
      <Button variant="ghost" size="sm" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? 'Adding…' : name ? 'Replace' : 'Choose file'}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="audio/*,.mp3,.ogg,.wav,.flac,.m4a"
        className="hidden"
        aria-label={`${layer.name} audio file`}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            const { importAssetFile } = await import('@/lib/moods/assets');
            const asset = await importAssetFile(f);
            onPick(asset.fingerprint, asset.name);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function EffectRack({ layer, onChange }: { layer: Layer; onChange: (effects: Effect[]) => void }) {
  const [adding, setAdding] = useState<EffectType | ''>('');
  return (
    <div className="flex flex-col gap-2">
      {layer.effects.map((fx, i) => {
        const meta = EFFECT_META[fx.type];
        return (
          <div
            key={i}
            className="rounded-[var(--radius-sm)] border border-border bg-surface/60 p-2 flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`${layer.name} ${meta.label} enabled`}
                checked={fx.enabled}
                onChange={(e) =>
                  onChange(
                    layer.effects.map((x, j) =>
                      j === i ? { ...x, enabled: e.target.checked } : x,
                    ),
                  )
                }
                className="accent-accent"
              />
              <span className="text-[11px] font-body text-text">{meta.label}</span>
              <button
                type="button"
                onClick={() => onChange(layer.effects.filter((_, j) => j !== i))}
                aria-label={`Remove ${meta.label} from ${layer.name}`}
                className="ml-auto text-text-muted hover:text-error text-sm cursor-pointer"
              >
                ×
              </button>
            </div>
            {Object.entries(meta.params).map(([k, pm]) => (
              <ParamControl
                key={k}
                id={`${layer.name} ${meta.label} ${pm.label}`}
                meta={pm}
                value={fx.params[k]}
                onChange={(v) =>
                  onChange(
                    layer.effects.map((x, j) =>
                      j === i ? { ...x, params: { ...x.params, [k]: v as number | string } } : x,
                    ),
                  )
                }
              />
            ))}
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <select
          aria-label={`Add effect to ${layer.name}`}
          value={adding}
          onChange={(e) => setAdding(e.target.value as EffectType | '')}
          className="h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[11px] text-text"
        >
          <option value="">Add effect…</option>
          {(Object.keys(EFFECT_META) as EffectType[]).map((t) => (
            <option key={t} value={t}>
              {EFFECT_META[t].label}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          disabled={!adding}
          onClick={() => {
            if (!adding) return;
            onChange([
              ...layer.effects,
              { type: adding, enabled: true, params: { ...EFFECT_DEFAULTS[adding] } },
            ]);
            setAdding('');
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function LayerStrip({
  layer,
  onChange,
  onRemove,
}: {
  layer: Layer;
  onChange: (l: Layer) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = PARAM_META[layer.type];
  return (
    <div
      className={cn(
        'rounded-[var(--radius-sm)] border border-border bg-surface/40',
        layer.muted && 'opacity-60',
      )}
      data-testid={`layer-${layer.id}`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-muted text-accent shrink-0">
          {LAYER_LABELS[layer.type]}
        </span>
        <input
          aria-label={`${layer.name} name`}
          value={layer.name}
          onChange={(e) => onChange({ ...layer, name: e.target.value })}
          className="w-32 bg-transparent text-xs text-text font-body outline-none border-b border-transparent focus:border-input-border-active"
        />
        <label className="flex items-center gap-1.5 flex-1 min-w-[140px] text-[10px] text-text-muted">
          <span>Gain</span>
          <input
            type="range"
            aria-label={`${layer.name} gain`}
            min={-60}
            max={6}
            step={1}
            value={layer.gain}
            onChange={(e) => onChange({ ...layer, gain: parseFloat(e.target.value) })}
            className="flex-1 accent-accent"
          />
          <span className="w-10 text-right font-mono">{layer.gain} dB</span>
        </label>
        <label className="flex items-center gap-1.5 w-28 text-[10px] text-text-muted">
          <span>Pan</span>
          <input
            type="range"
            aria-label={`${layer.name} pan`}
            min={-1}
            max={1}
            step={0.05}
            value={layer.pan}
            onChange={(e) => onChange({ ...layer, pan: parseFloat(e.target.value) })}
            className="flex-1 accent-accent"
          />
        </label>
        <button
          type="button"
          aria-pressed={layer.muted}
          aria-label={`Mute ${layer.name}`}
          onClick={() => onChange({ ...layer, muted: !layer.muted })}
          className={cn(
            'h-6 px-2 rounded-[var(--radius-sm)] text-[10px] font-mono border cursor-pointer',
            layer.muted
              ? 'bg-warning-bg text-warning-text border-warning-border'
              : 'border-border text-text-muted hover:text-text',
          )}
        >
          M
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${layer.name} settings`}
          className="h-6 px-2 rounded-[var(--radius-sm)] text-[10px] border border-border text-text-muted hover:text-text cursor-pointer"
        >
          {open ? 'Hide' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${layer.name}`}
          className="text-text-muted hover:text-error text-sm px-1 cursor-pointer"
        >
          ×
        </button>
      </div>
      {open && (
        <div className="px-2.5 pb-3 grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-caption">
              Parameters
            </div>
            {Object.entries(meta).map(([k, pm]) =>
              pm.kind === 'file' ? (
                <FileParam
                  key={k}
                  layer={layer}
                  onPick={(fingerprint, fileName) =>
                    onChange({ ...layer, params: { ...layer.params, fingerprint, fileName } })
                  }
                />
              ) : (
                <ParamControl
                  key={k}
                  id={`${layer.name} ${pm.label}`}
                  meta={pm}
                  value={layer.params[k]}
                  onChange={(v) => onChange({ ...layer, params: { ...layer.params, [k]: v } })}
                />
              ),
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-caption">
              Effects
            </div>
            <EffectRack layer={layer} onChange={(effects) => onChange({ ...layer, effects })} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResonanceTab() {
  const {
    mixes,
    activeMixId,
    playing,
    toggle,
    selectMix,
    upsertMix,
    deleteMix,
    playlist,
    playlistIndex,
    setPlaylist,
    cue,
  } = useAudioStore(
    useShallow((s) => ({
      mixes: s.mixes,
      activeMixId: s.activeMixId,
      playing: s.playing,
      toggle: s.toggle,
      selectMix: s.selectMix,
      upsertMix: s.upsertMix,
      deleteMix: s.deleteMix,
      playlist: s.playlist,
      playlistIndex: s.playlistIndex,
      setPlaylist: s.setPlaylist,
      cue: s.cue,
    })),
  );
  const [cues, setCues] = useState<SoundCues>(() => getCues());
  const [addToPlaylist, setAddToPlaylist] = useState('');
  const updateCue = (ev: CueEvent, kind: CueKind | null) => {
    const next = { ...cues, [ev]: kind };
    setCues(next);
    saveCues(next);
  };
  const mix = mixes.find((m) => m.id === activeMixId) ?? mixes[0];
  const history = useRef<{ past: Mix[]; future: Mix[] }>({ past: [], future: [] });
  const [hist, setHist] = useState({ past: 0, future: 0 });

  const commit = useCallback(
    (next: Mix, remember = true) => {
      if (remember && mix) {
        history.current.past.push(mix);
        if (history.current.past.length > 100) history.current.past.shift();
        history.current.future = [];
        setHist({ past: history.current.past.length, future: 0 });
      }
      void upsertMix(next);
    },
    [mix, upsertMix],
  );
  const undo = () => {
    const prev = history.current.past.pop();
    if (!prev || !mix) return;
    history.current.future.push(mix);
    setHist({ past: history.current.past.length, future: history.current.future.length });
    void upsertMix(prev);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next || !mix) return;
    history.current.past.push(mix);
    setHist({ past: history.current.past.length, future: history.current.future.length });
    void upsertMix(next);
  };

  const scaleOptions = useMemo(() => Object.keys(SCALES), []);

  if (!mix) return null;

  const setLayer = (l: Layer) =>
    commit({ ...mix, layers: mix.layers.map((x) => (x.id === l.id ? l : x)) });
  const addLayer = (t: LayerType) => commit({ ...mix, layers: [...mix.layers, createLayer(t)] });
  const removeLayer = (id: string) =>
    commit({ ...mix, layers: mix.layers.filter((x) => x.id !== id) });

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Mixes */}
      <aside className="w-52 shrink-0 flex flex-col gap-2 min-h-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-caption px-1">
          Mixes
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
          {mixes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => void selectMix(m.id)}
              aria-current={m.id === mix.id ? 'true' : undefined}
              className={cn(
                'text-left px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs cursor-pointer transition-colors',
                m.id === mix.id
                  ? 'bg-surface text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface/60',
              )}
            >
              <div className="truncate">{m.name}</div>
              <div className="text-[10px] font-mono text-text-muted">
                {m.layers.length} layer{m.layers.length === 1 ? '' : 's'}
                {m.id === activeMixId && playing ? ' · playing' : ''}
              </div>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const m = createMix({
                name: 'New mix',
                layers: [createLayer('drone', { gain: -18 })],
              });
              void upsertMix(m).then(() => selectMix(m.id));
            }}
          >
            New mix
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const copy: Mix = {
                ...JSON.parse(JSON.stringify(mix)),
                id: newId('mix'),
                name: `${mix.name} copy`,
                layers: mix.layers.map((l) => ({
                  ...JSON.parse(JSON.stringify(l)),
                  id: newId(l.type),
                })),
              };
              void upsertMix(copy).then(() => selectMix(copy.id));
            }}
          >
            Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={mixes.length < 2}
            onClick={() => deleteMix(mix.id)}
          >
            Delete
          </Button>
        </div>
      </aside>

      {/* Editor */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col gap-4 pr-1">
        {/* Transport + identity */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void toggle()}
            aria-label={playing ? 'Pause mix' : 'Play mix'}
            className="w-9 h-9 rounded-full bg-accent text-bg flex items-center justify-center cursor-pointer hover-bright shrink-0"
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 4l14 8-14 8z" />
              </svg>
            )}
          </button>
          <input
            aria-label="Mix name"
            value={mix.name}
            onChange={(e) => commit({ ...mix, name: e.target.value })}
            className="h-9 flex-1 min-w-[160px] rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-text font-display outline-none focus:border-input-border-active"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
            Key
            <select
              aria-label="Root note"
              value={mix.root}
              onChange={(e) => commit({ ...mix, root: e.target.value })}
              className="h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[11px] text-text"
            >
              {ROOTS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <select
              aria-label="Scale"
              value={mix.scale}
              onChange={(e) => commit({ ...mix, scale: e.target.value })}
              className="h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[11px] text-text"
            >
              {scaleOptions.map((sc) => (
                <option key={sc} value={sc}>
                  {sc}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
            Tempo
            <input
              type="range"
              aria-label="Tempo"
              min={20}
              max={140}
              step={1}
              value={mix.tempo}
              onChange={(e) => commit({ ...mix, tempo: parseInt(e.target.value, 10) })}
              className="w-24 accent-accent"
            />
            <span className="font-mono w-8">{mix.tempo}</span>
          </label>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={undo} disabled={hist.past === 0}>
            Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={hist.future === 0}>
            Redo
          </Button>
        </div>

        {/* Master */}
        <section className="rounded-[var(--radius-sm)] border border-border bg-surface/50 px-3 py-2.5 grid gap-1.5 md:grid-cols-3">
          <ParamControl
            id="Master reverb decay"
            meta={{ kind: 'range', label: 'Room size', min: 0.1, max: 20, step: 0.1, unit: 's' }}
            value={mix.master.reverbDecay}
            onChange={(v) =>
              commit({ ...mix, master: { ...mix.master, reverbDecay: v as number } })
            }
          />
          <ParamControl
            id="Master reverb mix"
            meta={{ kind: 'range', label: 'Room mix', min: 0, max: 1, step: 0.01 }}
            value={mix.master.reverbWet}
            onChange={(v) => commit({ ...mix, master: { ...mix.master, reverbWet: v as number } })}
          />
          <ParamControl
            id="Master volume"
            meta={{ kind: 'range', label: 'Mix volume', min: -24, max: 6, step: 1, unit: ' dB' }}
            value={mix.master.volume}
            onChange={(v) => commit({ ...mix, master: { ...mix.master, volume: v as number } })}
          />
        </section>

        {/* Layers */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-caption">
              Layers
            </div>
            <div className="flex flex-wrap gap-1">
              {LAYER_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addLayer(t)}
                  className="h-6 px-2 rounded-[var(--radius-sm)] border border-border bg-surface text-[10px] text-text-muted hover:text-accent hover:border-accent cursor-pointer"
                >
                  + {LAYER_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          {mix.layers.length === 0 && (
            <p className="text-xs text-text-muted py-4 text-center">Silence. Add a layer above.</p>
          )}
          {mix.layers.map((l) => (
            <LayerStrip
              key={l.id}
              layer={l}
              onChange={setLayer}
              onRemove={() => removeLayer(l.id)}
            />
          ))}
        </div>

        {/* Playlist */}
        <section className="rounded-[var(--radius-sm)] border border-border bg-surface/50 px-3 py-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-caption">
              Playlist
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
              <input
                type="checkbox"
                aria-label="Playlist enabled"
                checked={playlist.enabled}
                onChange={(e) => setPlaylist({ ...playlist, enabled: e.target.checked })}
                className="accent-accent"
              />
              Play through the list
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
              <input
                type="checkbox"
                aria-label="Shuffle"
                checked={playlist.shuffle}
                onChange={(e) => setPlaylist({ ...playlist, shuffle: e.target.checked })}
                className="accent-accent"
              />
              Shuffle
            </label>
          </div>
          {playlist.items.length === 0 && (
            <p className="text-[11px] text-text-muted">
              No items — add mixes below and turn the playlist on.
            </p>
          )}
          {playlist.items.map((it, i) => {
            const m = mixes.find((x) => x.id === it.mixId);
            const label = m?.name ?? it.mixId;
            const current = playlist.enabled && i === playlistIndex;
            return (
              <div
                key={`${it.mixId}-${i}`}
                className={cn(
                  'flex items-center gap-2 text-[11px] rounded-[var(--radius-sm)] px-2 py-1',
                  current ? 'bg-accent-muted text-text' : 'text-text-muted',
                )}
              >
                <span className="w-4 font-mono">{i + 1}</span>
                <span className="flex-1 truncate text-text">{label}</span>
                <label className="flex items-center gap-1">
                  <input
                    type="number"
                    aria-label={`${label} minutes`}
                    min={0.01}
                    step={1}
                    value={it.minutes}
                    onChange={(e) => {
                      const minutes = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                      setPlaylist({
                        ...playlist,
                        items: playlist.items.map((x, j) => (j === i ? { ...x, minutes } : x)),
                      });
                    }}
                    className="w-16 h-6 rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 text-[11px] text-text"
                  />
                  min
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="number"
                    aria-label={`${label} crossfade`}
                    min={0}
                    step={1}
                    value={it.crossfadeSec}
                    onChange={(e) => {
                      const crossfadeSec = Math.max(0, parseFloat(e.target.value) || 0);
                      setPlaylist({
                        ...playlist,
                        items: playlist.items.map((x, j) => (j === i ? { ...x, crossfadeSec } : x)),
                      });
                    }}
                    className="w-14 h-6 rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 text-[11px] text-text"
                  />
                  s fade
                </label>
                <button
                  type="button"
                  aria-label={`Move ${label} up`}
                  disabled={i === 0}
                  onClick={() => {
                    const items = [...playlist.items];
                    [items[i - 1], items[i]] = [items[i]!, items[i - 1]!];
                    setPlaylist({ ...playlist, items });
                  }}
                  className="px-1 text-text-muted hover:text-text disabled:opacity-30 cursor-pointer"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${label} from playlist`}
                  onClick={() =>
                    setPlaylist({ ...playlist, items: playlist.items.filter((_, j) => j !== i) })
                  }
                  className="px-1 text-text-muted hover:text-error cursor-pointer"
                >
                  ×
                </button>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <select
              aria-label="Add mix to playlist"
              value={addToPlaylist}
              onChange={(e) => setAddToPlaylist(e.target.value)}
              className="h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[11px] text-text"
            >
              <option value="">Add a mix…</option>
              {mixes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              disabled={!addToPlaylist}
              onClick={() => {
                if (!addToPlaylist) return;
                setPlaylist({
                  ...playlist,
                  items: [
                    ...playlist.items,
                    { mixId: addToPlaylist, minutes: 15, crossfadeSec: 6 },
                  ],
                });
                setAddToPlaylist('');
              }}
            >
              Add to playlist
            </Button>
          </div>
        </section>

        {/* Sound cues */}
        <section className="rounded-[var(--radius-sm)] border border-border bg-surface/50 px-3 py-2.5 flex flex-col gap-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-caption">
            Sound cues
          </div>
          <p className="text-[11px] text-text-muted">
            Short sounds on app events, ducking the mix while the AI works. Off until you've pressed
            play once.
          </p>
          {CUE_EVENTS.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-32 shrink-0 text-text">{ev.label}</span>
              <span className="flex-1 text-text-muted truncate">{ev.hint}</span>
              <select
                aria-label={`${ev.label} cue`}
                value={cues[ev.id] ?? ''}
                onChange={(e) => updateCue(ev.id, (e.target.value || null) as CueKind | null)}
                className="h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[11px] text-text"
              >
                <option value="">None</option>
                {CUE_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                disabled={!cues[ev.id]}
                onClick={() => {
                  const k = cues[ev.id];
                  if (k) void cue(k);
                }}
                aria-label={`Audition ${ev.label} cue`}
              >
                ▶
              </Button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
