import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCruxStore } from '@/stores/cruxStore';
import { DEFAULT_PANE_ORDER } from '@/stores/uiStore';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { getApiKey } from '@/ai/keys';
import { importCrux } from '@/services/crux-io';
import { useGardenStore } from '@/stores/gardenStore';
import { Modal, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { loadTemplate } from '@/templates';
import type { CruxKind } from '@/api/types';
import { Capability, can } from '@/lib/platform';

// ── Icons ────────────────────────────────────────────────

function BlogIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

// ── Templates ────────────────────────────────────────────

interface Template {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** CSS-only mini wireframe preview */
  thumb: React.ReactNode;
  kind: CruxKind;
  defaultTitle: string;
  /** Requires the desktop app (Build capability) — real toolchain projects */
  desktopOnly?: boolean;
}

// ── Thumbnails ──────────────────────────────────────────
// Tiny CSS wireframe previews (~80×52px) for each template.
// Uses inline styles to stay self-contained — no external CSS needed.

const T = {
  wrap: { width: '100%', height: 52, borderRadius: 4, overflow: 'hidden' as const, position: 'relative' as const, fontSize: 0 },
  bar: (w: string | number, h = 3, bg = '#555') => ({ width: w, height: h, borderRadius: 1, background: bg }),
  line: (w: string | number, h = 2, bg = '#444') => ({ width: w, height: h, borderRadius: 1, background: bg }),
  box: (w: string | number, h: string | number, bg = '#333') => ({ width: w, height: h, borderRadius: 2, background: bg }),
  flex: (gap = 3, dir: 'row' | 'column' = 'row') => ({ display: 'flex' as const, gap, flexDirection: dir }),
  col: (gap = 2) => ({ display: 'flex' as const, flexDirection: 'column' as const, gap }),
  pad: (p = 6) => ({ padding: p }),
  center: { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
} as const;

function BlankThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1a1a1a', ...T.center }}>
      <div style={{ ...T.col(3), alignItems: 'center' }}>
        <div style={T.bar(16, 16, '#252525')} />
        <div style={T.line(24, 2, '#252525')} />
      </div>
    </div>
  );
}

function BlogThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1c1c1c', ...T.pad(6) }}>
      <div style={T.col(3)}>
        <div style={T.bar('40%', 3)} />
        <div style={T.line('90%')} />
        <div style={T.line('80%')} />
        <div style={T.line('70%')} />
        <div style={{ marginTop: 3, ...T.col(2) }}>
          <div style={T.bar('35%', 2)} />
          <div style={T.line('85%')} />
          <div style={T.line('60%')} />
        </div>
      </div>
    </div>
  );
}

const TEMPLATES: Template[] = [
  { id: 'blank', label: 'Blank', description: 'Empty workspace — grow anything from scratch', icon: <LayoutIcon />, thumb: <BlankThumb />, kind: 'webapp', defaultTitle: 'My Crux' },
  { id: 'astro-blog', label: 'Astro Blog', description: 'A real Astro site — live dev server, markdown posts', icon: <BlogIcon />, thumb: <BlogThumb />, kind: 'webapp', defaultTitle: 'My Blog', desktopOnly: true },
];
// ── Component ────────────────────────────────────────────

interface NewCruxModalProps {
  open: boolean;
  onClose: () => void;
}

export default function NewCruxModal({ open, onClose }: NewCruxModalProps) {
  const navigate = useNavigate();
  const createCrux = useCruxStore((s) => s.createCrux);
  const refresh = useGardenStore((s) => s.load);

  const [title, setTitle] = useState('My Crux');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');
  const [creating, setCreating] = useState(false);

  // Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  const template = (TEMPLATES.find((t) => t.id === selectedTemplate) ?? TEMPLATES[0])!;

  const reset = () => {
    setTitle('My Crux');
    setSelectedTemplate('blank');
    setCreating(false);
  };

  const handleImport = useCallback(
    async (file: File) => {
      setImporting(true);
      setImportProgress({ done: 0, total: 0 });

      try {
        const result = await importCrux({
          data: file,
          mode: 'clone',
          onProgress: (done, total) => setImportProgress({ done, total }),
        });

        if (result.layout) {
          const layout = result.layout;
          if (layout.paneOrder && layout.paneVisibility) {
            setSetting(
              `cruxgarden:layout:${result.cruxId}`,
              JSON.stringify({ paneOrder: layout.paneOrder, paneVisibility: layout.paneVisibility }),
            );
          }
          if (layout.editorTabs) {
            setSetting(`cruxgarden:editor-tabs:${result.cruxId}`, JSON.stringify(layout.editorTabs));
          }
          if (layout.folderState) {
            setSetting(`cruxgarden:folder-state:${result.cruxId}`, JSON.stringify(layout.folderState));
          }
        }

        if (result.theme) {
          if (result.theme.mode) setSetting(SettingsKey.Theme, result.theme.mode);
          if (result.theme.tint) setSetting(SettingsKey.Tint, result.theme.tint);
        }

        if (result.failedArtifacts.length > 0) {
          console.warn('Some artifacts failed to import:', result.failedArtifacts);
          alert(`Import completed with ${result.failedArtifacts.length} file${result.failedArtifacts.length > 1 ? 's' : ''} that could not be restored.`);
        }

        refresh();
        reset();
        onClose();
        navigate(`/c/${result.cruxId}`);
      } catch (err) {
        console.error('Import failed:', err);
        alert(`Failed to import .crux file: ${err instanceof Error ? err.message : 'Make sure it is a valid export.'}`);
      } finally {
        setImporting(false);
        setImportProgress({ done: 0, total: 0 });
      }
    },
    [navigate, refresh, onClose],
  );

  const handleImportInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleImport(file);
      e.target.value = '';
    },
    [handleImport],
  );

  const handleCreate = async (quickStart = false) => {
    setCreating(true);
    try {
      const effectiveTitle = quickStart
        ? undefined
        : title.trim() || template.defaultTitle || undefined;

      const crux = await createCrux(effectiveTitle);

      // Load template files and set kind/context/greeting if not quick-start blank
      let templateDef: Awaited<ReturnType<typeof loadTemplate>> = null;
      if (!quickStart && template.id !== 'blank') {
        const { getServices } = await import('@/services');
        const services = getServices();

        const updates: Record<string, unknown> = { kind: template.kind };

        // Load template definition and create artifact files
        templateDef = await loadTemplate(template.id);
        if (templateDef) {
          // Create each template file as an artifact
          for (const file of templateDef.files) {
            await services.artifact.create({
              resourceId: crux.id,
              content: file.content,
              meta: { path: file.path },
            });
          }

          // Script-driven setup (desktop): run the template's scaffold in the
          // Project Folder — files it writes are ingested from disk by the
          // watcher automatically. Failure is non-fatal: embedded files stand.
          if (templateDef.scaffold) {
            try {
              const { runScaffold } = await import('@/services/site');
              await runScaffold(crux.id, templateDef.scaffold.pnpmArgs);
            } catch (err) {
              console.error('[template] scaffold failed:', err);
            }
          }

          // Replace greeting with template-specific intro and append context to system prompt
          if (crux.meta?.settings?.systemPrompt) {
            const messages = templateDef.greeting
              ? [{ role: 'assistant' as const, content: templateDef.greeting }]
              : crux.meta.messages ?? [];

            updates.meta = {
              ...crux.meta,
              messages,
              settings: {
                ...crux.meta.settings,
                systemPrompt: templateDef.context
                  ? crux.meta.settings.systemPrompt + '\n\nCONTEXT: ' + templateDef.context
                  : crux.meta.settings.systemPrompt,
              },
              // Store form schema for data-driven templates. Content-model
              // templates reuse the same machinery for their settings file.
              ...(templateDef.schema ? { formSchema: templateDef.schema } : {}),
              ...(templateDef.contentModel
                ? {
                    contentModel: templateDef.contentModel,
                    ...(templateDef.contentModel.settings && !templateDef.schema
                      ? { formSchema: { fields: templateDef.contentModel.settings.fields } }
                      : {}),
                  }
                : {}),
            };

            // Update store messages so UI reflects the greeting immediately
            if (templateDef.greeting) {
              useCruxStore.getState().setMessages(messages);
            }
          }
        }

        await services.crux.update(crux.id, updates);
      }

      // Set initial pane layout based on template preset (or fallback for blank)
      const hasApiKey = !!(await getApiKey('anthropic'));
      const visibility: Record<string, boolean> = {};
      for (const pane of DEFAULT_PANE_ORDER) visibility[pane] = false;

      const templateLayout = (!quickStart && template.id !== 'blank') ? templateDef?.layout : null;

      if (templateLayout) {
        // Template with a layout preset — use its pane set and mosaic tree
        for (const pane of templateLayout.panes) visibility[pane] = true;
        setSetting(
          `cruxgarden:layout:${crux.id}`,
          JSON.stringify({
            paneOrder: DEFAULT_PANE_ORDER,
            paneVisibility: visibility,
            mosaicLayout: templateLayout.mosaic,
          }),
        );
      } else {
        // Blank workspace fallback
        if (hasApiKey) {
          visibility.collaboration = true;
          visibility.details = true;
        } else {
          visibility.collaboration = true;
          visibility.artifacts = true;
          visibility.workshop = true;
        }
        setSetting(
          `cruxgarden:layout:${crux.id}`,
          JSON.stringify({ paneOrder: DEFAULT_PANE_ORDER, paneVisibility: visibility }),
        );
      }

      reset();
      onClose();
      navigate(`/c/${crux.id}`);
    } catch {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating || importing) return;
    reset();
    onClose();
  };

  const inputClass = cn(
    'w-full px-3 py-2 text-sm font-mono rounded-[var(--radius-sm)]',
    'bg-surface-solid border border-border text-text placeholder:text-text-muted/50',
    'focus:outline-none focus:border-accent transition-colors',
    'disabled:opacity-50',
  );

  return (
    <Modal open={open} onClose={handleClose} size="screen" title="Add Crux">
      <div className="flex flex-col h-full gap-5">
        {/* Name */}
        <div className="shrink-0">
          <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
            Name
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            onFocus={(e) => e.target.select()}
            placeholder={template.defaultTitle || 'My Crux'}
            disabled={creating}
            className={inputClass}
            autoFocus
          />
        </div>

        {/* Template selector — scrollable */}
        <div className="flex-1 min-h-0 flex flex-col">
          <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2 shrink-0">
            Template
          </label>
          <div className="overflow-y-auto flex-1 min-h-0 pr-0.5">
            <div className="flex flex-col">
              {TEMPLATES.filter((t) => !t.desktopOnly || can(Capability.Build)).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTemplate(t.id);
                    if (!title.trim() && t.defaultTitle) {
                      setTitle(t.defaultTitle);
                    }
                  }}
                  disabled={creating}
                  className={cn(
                    'w-full px-3 py-2.5 text-left cursor-pointer',
                    'flex items-center gap-3 border-b border-border last:border-b-0',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    selectedTemplate === t.id
                      ? 'bg-accent-muted/30'
                      : 'hover:bg-accent-muted/15',
                  )}
                >
                  <div className="w-10 h-10 shrink-0 rounded-[var(--radius-sm)] overflow-hidden border border-border">
                    {t.thumb}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      'text-sm font-mono block truncate',
                      selectedTemplate === t.id ? 'text-accent' : 'text-text',
                    )}>
                      {t.label}
                    </span>
                    {t.description && (
                      <span className="text-[11px] text-text-muted block truncate">
                        {t.description}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {template.id !== 'blank' && (
            <p className="text-[11px] text-text-muted mt-1.5 shrink-0">{template.description}</p>
          )}
        </div>

        {/* Actions — pinned to bottom */}
        <div className="shrink-0 flex items-center justify-between border-t border-border pt-4">
          <input
            ref={importInputRef}
            type="file"
            accept=".crux,.zip"
            className="hidden"
            onChange={handleImportInput}
          />
          {importing ? (
            <div className="flex items-center gap-3">
              <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
                <svg width="24" height="24" viewBox="0 0 28 28" className="-rotate-90">
                  <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
                  <circle
                    cx="14" cy="14" r="12"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    className="text-accent transition-[stroke-dashoffset] duration-300"
                    strokeDasharray={2 * Math.PI * 12}
                    strokeDashoffset={importProgress.total > 0 ? 2 * Math.PI * 12 * (1 - importProgress.done / importProgress.total) : 2 * Math.PI * 12}
                  />
                </svg>
                <span className="absolute text-[8px] font-mono text-text-muted">
                  {importProgress.total > 0 ? Math.round((importProgress.done / importProgress.total) * 100) : 0}
                </span>
              </div>
              <span className="text-xs font-mono text-text-muted">Importing...</span>
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => importInputRef.current?.click()}
              disabled={creating}
            >
              Import .crux file
            </Button>
          )}
          <Button onClick={() => handleCreate()} loading={creating} disabled={importing}>
            Create
          </Button>
        </div>
      </div>

    </Modal>
  );
}
