import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { GARDEN_DARK, getVar } from '@/lib/moods';
import {
  applyActiveMood,
  activePreset,
  getThemeOverrides,
  getThemePreview,
  onThemePreviewChange,
  resolvedSection,
  setThemeOverrides,
  setThemePreview,
  type MoodSection,
  type ThemeOverrides,
} from '@/lib/moods/active';
import {
  groupTokens,
  isDerived,
  tokenKind,
  tokenChoices,
  tokenLabel,
  type TokenGroup,
} from '@/lib/moods/token-groups';
import { Button } from '@/components/ui';
import { assetRef, getAssets } from '@/lib/moods/assets';
import { saveUserPreset, toThemeFile, parseThemeFile } from '@/lib/moods/user-presets';
import { useAppStore } from '@/stores/appStore';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

/**
 * The Theme tab of the Mood Builder: every palette token, grouped, editable,
 * applied live. Edits are stored per mode as overrides on top of the active
 * preset (lib/moods/active.ts) — picking another preset keeps them.
 */

/** Resolve any CSS color expression (var(), color-mix(), rgba) to #rrggbb. */
function useColorResolver(onReady?: () => void) {
  const probe = useRef<HTMLSpanElement | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;';
    document.body.appendChild(el);
    probe.current = el;
    readyRef.current?.();
    return () => {
      el.remove();
      probe.current = null;
    };
  }, []);
  return useCallback((cssVar: string): string | null => {
    const el = probe.current;
    if (!el) return null;
    el.style.color = `var(${cssVar})`;
    const m = getComputedStyle(el).color.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length >= 4 && parts[3] === 0) return null;
    const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    return `#${hex(parts[0]!)}${hex(parts[1]!)}${hex(parts[2]!)}`;
  }, []);
}

function parseLength(v: string): { n: number; unit: string } | null {
  const m = v.trim().match(/^(-?\d*\.?\d+)(px|rem|em|%|ms|s)$/);
  return m ? { n: parseFloat(m[1]!), unit: m[2]! } : null;
}

interface RowProps {
  tokenKey: string;
  group: TokenGroup;
  value: string; // current effective value (override, else preset/base)
  overridden: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
  resolveColor: (cssVar: string) => string | null;
  /** re-resolve trigger */
  tick: number;
}

function TokenRow({
  tokenKey,
  group,
  value,
  overridden,
  onChange,
  onReset,
  resolveColor,
  tick,
}: RowProps) {
  const kind = tokenKind(tokenKey);
  const label = tokenLabel(tokenKey, group);
  const cssVar = getVar(tokenKey);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = draft.trim();
    if (!v) return onReset();
    if (v !== value) onChange(v);
  };

  const swatch = useMemo(
    () => (kind === 'color' ? resolveColor(cssVar) : null),
    // tick forces a re-resolve after the palette is re-applied
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, cssVar, resolveColor, tick, value],
  );

  const len = kind === 'length' ? parseLength(value) : null;

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)]',
        overridden ? 'bg-accent-muted/40' : 'hover:bg-surface/60',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {overridden && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
          <span className="text-xs font-body text-text truncate">{label}</span>
        </div>
        <div className="text-2xs font-mono text-text-muted truncate">
          {cssVar}
          {!overridden && isDerived(value) && <span className="ml-1.5 opacity-70">inherits</span>}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {kind === 'color' && (
          <label
            className="relative w-7 h-7 rounded-[var(--radius-sm)] border border-border overflow-hidden cursor-pointer shrink-0"
            style={{ backgroundColor: swatch ?? 'transparent' }}
            title={swatch ?? 'transparent'}
          >
            {!swatch && (
              <span className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(128,128,128,.35)_4px_8px)]" />
            )}
            <input
              type="color"
              aria-label={`${label} color`}
              value={swatch ?? '#000000'}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        )}
        {kind === 'length' && len && (
          <input
            type="range"
            aria-label={`${label} slider`}
            min={0}
            max={len.unit === 'px' ? 64 : len.unit === 'ms' ? 1000 : 3}
            step={len.unit === 'px' ? 1 : len.unit === 'ms' ? 10 : 0.05}
            value={len.n}
            onChange={(e) => onChange(`${e.target.value}${len.unit}`)}
            className="w-24 accent-accent"
          />
        )}
        {kind === 'asset' && (
          <select
            aria-label={`${label} asset`}
            value=""
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
              e.target.value = '';
            }}
            className="h-7 w-28 rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 text-xxs text-text"
          >
            <option value="">Pick asset…</option>
            {getAssets()
              .filter((a) =>
                tokenKey.startsWith('fontFace') ? a.kind === 'font' : a.kind === 'image',
              )
              .map((a) => (
                <option key={a.fingerprint} value={assetRef(a.fingerprint)}>
                  {a.name}
                </option>
              ))}
            <option value="none">none</option>
          </select>
        )}
        {kind === 'choice' && (
          <select
            aria-label={`${label} option`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-40 rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 text-xxs text-text"
          >
            {(tokenChoices(tokenKey) ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        {kind === 'number' && (
          <input
            type="range"
            aria-label={`${label} slider`}
            min={0}
            max={/Density$/.test(tokenKey) ? 1000 : /^react/.test(tokenKey) ? 1 : 2}
            step={/Density$/.test(tokenKey) ? 10 : /^react/.test(tokenKey) ? 0.05 : 0.05}
            value={Number(value) || 0}
            onChange={(e) => onChange(e.target.value)}
            className="w-24 accent-accent"
          />
        )}
        <input
          type="text"
          aria-label={`${label} value`}
          hidden={kind === 'choice'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setDraft(value);
          }}
          spellCheck={false}
          className={cn(
            'h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-xxs font-mono text-text',
            'focus:outline-none focus:border-input-border-active',
            kind === 'font' || kind === 'text' ? 'w-56' : 'w-40',
          )}
        />
        <button
          type="button"
          onClick={onReset}
          disabled={!overridden}
          aria-label={`Reset ${label}`}
          title="Reset to preset"
          className={cn(
            'w-6 h-7 text-sm leading-none rounded-[var(--radius-sm)] transition-colors',
            overridden
              ? 'text-text-muted hover:text-error cursor-pointer'
              : 'text-transparent pointer-events-none',
          )}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function ThemeTokensTab() {
  const section: MoodSection = resolvedSection();
  const preset = activePreset(section);
  const groups = useMemo(() => groupTokens(), []);
  const [groupId, setGroupId] = useState(groups[0]!.group.id);
  const [query, setQuery] = useState('');
  const [overrides, setOverrides] = useState<ThemeOverrides>(() => getThemeOverrides(section));
  const [tick, setTick] = useState(0);
  // Undo / redo over whole override sets (session only)
  const history = useRef<{ past: ThemeOverrides[]; future: ThemeOverrides[] }>({
    past: [],
    future: [],
  });
  const [histLen, setHistLen] = useState({ past: 0, future: 0 });
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState(() => Object.keys(getThemePreview()).length);
  useEffect(
    () =>
      onThemePreviewChange(() => {
        setPreviewCount(Object.keys(getThemePreview()).length);
        setTick((t) => t + 1);
      }),
    [],
  );
  // Swatches resolve through a probe element that exists only after mount — re-render once it does
  const resolveColor = useColorResolver(() => setTick((t) => t + 1));
  const fileRef = useRef<HTMLInputElement>(null);

  // The mode can change under us (a preset from the other section was picked)
  useEffect(() => {
    setOverrides(getThemeOverrides(section));
  }, [section, preset?.id]);

  const commit = useCallback(
    (next: ThemeOverrides) => {
      setOverrides(next);
      setThemeOverrides(section, next);
      applyActiveMood(section);
      // Colors that derive from the edited one need a re-resolve after paint
      requestAnimationFrame(() => setTick((t) => t + 1));
    },
    [section],
  );

  /** A user edit: remembered for undo. */
  const persist = useCallback(
    (next: ThemeOverrides) => {
      const h = history.current;
      h.past.push(overrides);
      if (h.past.length > 100) h.past.shift();
      h.future = [];
      setHistLen({ past: h.past.length, future: 0 });
      commit(next);
    },
    [overrides, commit],
  );

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(overrides);
    setHistLen({ past: h.past.length, future: h.future.length });
    commit(prev);
  }, [overrides, commit]);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(overrides);
    setHistLen({ past: h.past.length, future: h.future.length });
    commit(next);
  }, [overrides, commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /** The complete look: base preset + edits, standalone. */
  const fullLook = useCallback(
    (): ThemeOverrides => ({ ...(preset?.overrides ?? {}), ...overrides }),
    [preset, overrides],
  );

  const presetKeyFor = (s: MoodSection) =>
    s === 'Light' ? SettingsKey.MoodPresetLight : SettingsKey.MoodPresetDark;

  const saveAsPreset = () => {
    const author = useAppStore.getState().author?.username;
    const saved = saveUserPreset({ name: presetName, section, overrides: fullLook(), author });
    // It becomes the active preset for this mode; the loose edits are folded in
    setSetting(presetKeyFor(section), saved.id);
    commit({});
    history.current = { past: [], future: [] };
    setHistLen({ past: 0, future: 0 });
    setSaving(false);
    setPresetName('');
    setSavedNote(`Saved "${saved.name}" — find it in the Mood presets under Yours.`);
    setTimeout(() => setSavedNote(null), 4000);
  };

  const effective = (key: string): string =>
    overrides[key] ??
    preset?.overrides[key] ??
    ((GARDEN_DARK as Record<string, string>)[key] || '');

  const overriddenIn = (keys: string[]) => keys.filter((k) => k in overrides).length;
  const total = Object.keys(overrides).length;

  const current = groups.find((g) => g.group.id === groupId) ?? groups[0]!;
  const q = query.trim().toLowerCase();
  const visible = q
    ? groups.flatMap((g) =>
        g.keys
          .filter(
            (k) =>
              k.toLowerCase().includes(q) ||
              tokenLabel(k, g.group).toLowerCase().includes(q) ||
              getVar(k).includes(q),
          )
          .map((k) => ({ key: k, group: g.group })),
      )
    : current.keys.map((k) => ({ key: k, group: current.group }));

  /** Export the complete look as a shareable .cruxmood.json */
  const exportJson = () => {
    const author = useAppStore.getState().author?.username;
    const name = preset ? `${preset.name}${total ? ' (edited)' : ''}` : 'Garden Dark';
    const file = toThemeFile({ name, section, overrides: fullLook(), author });
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.cruxmood.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Import: a named theme file becomes a preset under Yours; a bare map becomes edits. */
  const importJson = async (file: File) => {
    const parsed = parseThemeFile(await file.text());
    if (!parsed) return;
    if (parsed.name) {
      const saved = saveUserPreset({
        name: parsed.name,
        section: parsed.section ?? section,
        overrides: parsed.overrides,
        author: parsed.author,
      });
      if (saved.section === section) {
        setSetting(presetKeyFor(section), saved.id);
        commit({});
      }
      setSavedNote(`Imported "${saved.name}" — find it in the Mood presets under Yours.`);
      setTimeout(() => setSavedNote(null), 4000);
      return;
    }
    persist(parsed.overrides);
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="text-xs text-text-muted">
          Editing the <span className="text-text">{section}</span> theme
          {preset && (
            <>
              {' '}
              on the <span className="text-text">{preset.name}</span> preset
            </>
          )}
          {total > 0 && (
            <>
              {' '}
              · <span className="text-accent">{total} custom</span>
            </>
          )}
        </div>
        {previewCount > 0 && (
          <button
            type="button"
            onClick={() => setThemePreview(null)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-sm)] border border-warning-border bg-warning-bg text-warning-text text-xxs cursor-pointer"
            title="A conversation is previewing tokens on top of your theme"
          >
            AI preview: {previewCount} token{previewCount === 1 ? '' : 's'} · clear
          </button>
        )}
        <div className="flex-1" />
        <input
          type="search"
          placeholder="Find a token…"
          aria-label="Find a token"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-48 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-input-border-active"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={undo}
          disabled={histLen.past === 0}
          title="Undo (⌘Z)"
        >
          Undo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={redo}
          disabled={histLen.future === 0}
          title="Redo (⇧⌘Z)"
        >
          Redo
        </Button>
        {saving ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveAsPreset();
            }}
          >
            <input
              autoFocus
              aria-label="Preset name"
              placeholder="Name this look…"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSaving(false)}
              className="h-8 w-40 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-input-border-active"
            />
            <Button size="sm" type="submit">
              Save
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setSaving(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setSaving(true)}>
            Save as preset
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={exportJson}>
          Export
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = '';
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => persist({})} disabled={total === 0}>
          Reset all
        </Button>
      </div>

      {savedNote && (
        <p role="status" className="text-xxs text-accent -mt-1">
          {savedNote}
        </p>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Groups */}
        <nav
          className="w-48 shrink-0 overflow-y-auto flex flex-col gap-0.5"
          aria-label="Token groups"
        >
          {groups.map(({ group, keys }) => {
            const n = overriddenIn(keys);
            const active = !q && group.id === groupId;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setQuery('');
                  setGroupId(group.id);
                }}
                className={cn(
                  'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-left text-xs cursor-pointer transition-colors',
                  active
                    ? 'bg-surface text-text'
                    : 'text-text-muted hover:text-text hover:bg-surface/60',
                )}
              >
                <span className="truncate">{group.label}</span>
                {n > 0 && <span className="text-2xs font-mono text-accent shrink-0">{n}</span>}
              </button>
            );
          })}
        </nav>

        {/* Tokens */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!q && <p className="text-xxs text-text-muted px-3 pb-2">{current.group.hint}</p>}
          <div className="flex flex-col gap-0.5">
            {visible.map(({ key, group }) => (
              <TokenRow
                key={key}
                tokenKey={key}
                group={group}
                value={effective(key)}
                overridden={key in overrides}
                onChange={(v) => persist({ ...overrides, [key]: v })}
                onReset={() => {
                  const next = { ...overrides };
                  delete next[key];
                  persist(next);
                }}
                resolveColor={resolveColor}
                tick={tick}
              />
            ))}
            {visible.length === 0 && (
              <p className="text-xs text-text-muted px-3 py-6 text-center">No tokens match.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
