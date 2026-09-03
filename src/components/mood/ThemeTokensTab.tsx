import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { GARDEN_DARK, getVar } from '@/lib/moods';
import {
  applyActiveMood,
  activePreset,
  getThemeOverrides,
  resolvedSection,
  setThemeOverrides,
  type MoodSection,
  type ThemeOverrides,
} from '@/lib/moods/active';
import {
  groupTokens,
  isDerived,
  tokenKind,
  tokenLabel,
  type TokenGroup,
} from '@/lib/moods/token-groups';
import { Button } from '@/components/ui';

/**
 * The Theme tab of the Mood Builder: every palette token, grouped, editable,
 * applied live. Edits are stored per mode as overrides on top of the active
 * preset (lib/moods/active.ts) — picking another preset keeps them.
 */

/** Resolve any CSS color expression (var(), color-mix(), rgba) to #rrggbb. */
function useColorResolver() {
  const probe = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;';
    document.body.appendChild(el);
    probe.current = el;
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
  const m = v.trim().match(/^(-?\d*\.?\d+)(px|rem|em|%)$/);
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
        <div className="text-[10px] font-mono text-text-muted truncate">
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
            max={len.unit === 'px' ? 64 : 3}
            step={len.unit === 'px' ? 1 : 0.05}
            value={len.n}
            onChange={(e) => onChange(`${e.target.value}${len.unit}`)}
            className="w-24 accent-accent"
          />
        )}
        {kind === 'number' && (
          <input
            type="range"
            aria-label={`${label} slider`}
            min={0}
            max={/Density$/.test(tokenKey) ? 1000 : 2}
            step={/Density$/.test(tokenKey) ? 10 : 0.05}
            value={Number(value) || 0}
            onChange={(e) => onChange(e.target.value)}
            className="w-24 accent-accent"
          />
        )}
        <input
          type="text"
          aria-label={`${label} value`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setDraft(value);
          }}
          spellCheck={false}
          className={cn(
            'h-7 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[11px] font-mono text-text',
            'focus:outline-none focus:border-accent',
            kind === 'font' ? 'w-56' : 'w-40',
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
  const resolveColor = useColorResolver();
  const fileRef = useRef<HTMLInputElement>(null);

  // The mode can change under us (a preset from the other section was picked)
  useEffect(() => {
    setOverrides(getThemeOverrides(section));
  }, [section, preset?.id]);

  const persist = useCallback(
    (next: ThemeOverrides) => {
      setOverrides(next);
      setThemeOverrides(section, next);
      applyActiveMood(section);
      // Colors that derive from the edited one need a re-resolve after paint
      requestAnimationFrame(() => setTick((t) => t + 1));
    },
    [section],
  );

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

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ section, preset: preset?.id, overrides }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crux-theme-${section.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as
        | { overrides?: unknown }
        | Record<string, unknown>;
      const raw = (
        parsed && typeof parsed === 'object' && 'overrides' in parsed ? parsed.overrides : parsed
      ) as Record<string, unknown>;
      const next: ThemeOverrides = {};
      for (const [k, v] of Object.entries(raw ?? {})) {
        if (k in GARDEN_DARK && typeof v === 'string') next[k] = v;
      }
      persist(next);
    } catch {
      /* not a theme file — leave things as they are */
    }
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
        <div className="flex-1" />
        <input
          type="search"
          placeholder="Find a token…"
          aria-label="Find a token"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-48 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
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
                {n > 0 && <span className="text-[10px] font-mono text-accent shrink-0">{n}</span>}
              </button>
            );
          })}
        </nav>

        {/* Tokens */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!q && <p className="text-[11px] text-text-muted px-3 pb-2">{current.group.hint}</p>}
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
