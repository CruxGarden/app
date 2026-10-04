import { captureGardenId, cruxPath, inGarden, useGardenContext } from '@/stores/gardenContext';
import { inferStartingPoint, nameFromIdea } from '@/lib/infer-starting-point';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { plainError } from '@/lib/error-text';
import { getServices } from '@/services';
import { startFromFiles } from '@/services/file-routing';
import { isEmbeddedApp } from '@/services/embedded-app';
import { lazy, Suspense, Fragment, useEffect, useState, useRef, useCallback } from 'react';
const Undertakings = lazy(() => import('./Undertakings'));
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { createCruxStore } from '@/stores/cruxStore';
import { useUIStore } from '@/stores/uiStore';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { installToolFile } from '@/services/crux-tools/files';
import { installImportedCreation, installMoodFile } from '@/services/import-installation';
import { importCrux } from '@/services/crux-io';
import { useGardenStore } from '@/stores/gardenStore';
import { Modal, Button, SectionLabel, buttonClass, fieldClass, linkClass } from '@/components/ui';
import { cn } from '@/lib/cn';
import { FIVE_WS_NAME, FIVE_WS_TEMPLATE_ID, FIVE_WS_TAGLINE } from '@/templates';
import { applyTemplateToCrux } from '@/services/crux-create';
import type { CruxKind } from '@/api/types';
import { Capability, can } from '@/lib/platform';
import { alertDialog } from '@/stores/dialogStore';
import { HomeIcon, LayoutIcon, PencilIcon } from '@/components/ui/icons';
import { toolManifests, isToolAvailable } from '@/services/crux-tools/registry';
import { useInstalledTools, forgetInstalledTool } from '@/services/crux-tools/installed';
import type { ToolIcon } from '@/services/crux-tools/manifest';
import {
  BlankThumb,
  HomeThumb,
  BlogThumb,
  ResumeThumb,
  BusinessThumb,
  GalleryThumb,
  FeedThumb,
  MediaThumb,
  FiveWsThumb,
} from './TemplateThumbs';

// ── Templates ────────────────────────────────────────────

interface Template {
  /** Position in the menu; tools carry theirs in the manifest. */
  order: number;
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
  /** A v2 feature (Capability.V2): not in the single-user v1 release */
  v2?: boolean;
}

// ── Thumbnails ──────────────────────────────────────────
// Tiny CSS wireframe previews (~80×52px) for each template.
// Uses inline styles to stay self-contained — no external CSS needed.

/** Entries the app itself owns; every Crux Tool comes from its manifest (ADR 0050). */
const OWN_TEMPLATES: Template[] = [
  {
    order: 500,
    id: 'tool-starter',
    label: 'Make a tool',
    description:
      'Build an editor others can install from Explore. Includes a working example and publishing guide.',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'My Tool',
    desktopOnly: true,
  },
  {
    order: 0.5,
    id: 'hello-world',
    label: 'Hello, world',
    description: 'Make your first home page with a name and photo. No AI needed.',
    icon: <HomeIcon />,
    thumb: <HomeThumb />,
    kind: 'webapp',
    defaultTitle: 'My Home Page',
    desktopOnly: true,
  },
  {
    order: 0,
    id: 'blank',
    label: 'Blank',
    description: 'Start with your own idea — no files or setup to choose',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'My Crux',
  },
  {
    order: 1,
    id: 'notes',
    label: 'Notes',
    description: 'A local Markdown notebook you can customize and publish',
    icon: <PencilIcon />,
    thumb: <BlankThumb />,
    kind: 'notes',
    defaultTitle: 'My Notebook',
    desktopOnly: true,
  },
  {
    order: 2,
    id: 'blender',
    label: 'Blender',
    description: 'Model in Blender · keep scenes, renders and game assets in Garden',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'My Blender scene',
    desktopOnly: true,
  },
  {
    order: 3,
    id: 'figma',
    label: 'Figma',
    description: 'Design in Figma · keep your brief and exported assets in Garden',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'My Figma design',
    desktopOnly: true,
  },
  {
    order: 4,
    id: 'moqira',
    label: 'Mockups',
    description: 'Design wireframes with Moqira, then share an interactive public edition',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'My Mockups',
    desktopOnly: true,
  },
  {
    order: 5,
    id: 'tool-excalidraw',
    label: 'Whiteboard',
    description: 'Visual thinking · draw diagrams and map ideas with Excalidraw',
    defaultTitle: 'Idea map',
    icon: <PencilIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    desktopOnly: true,
  },
  {
    order: 6,
    id: 'tool-univer',
    label: 'Spreadsheet',
    description: 'Productivity · budgets, formulas and workbooks with Univer',
    defaultTitle: 'Studio budget',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    desktopOnly: true,
  },
  {
    order: 43,
    id: 'tool-tables',
    label: 'Tables',
    description: 'Business & productivity · projects, contacts and inventory',
    defaultTitle: 'Launch board',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    desktopOnly: true,
  },
  {
    order: 44,
    id: 'tool-smplr',
    label: 'Sample sequencer',
    description: 'Creative · sample pads and a saved sixteen-step rhythm',
    defaultTitle: 'Pocket rhythm',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    desktopOnly: true,
  },
  {
    order: 45,
    id: 'tool-playcanvas',
    label: '3D Workshop',
    description: 'Creative · build an interactive scene with PlayCanvas',
    defaultTitle: 'Little world',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    desktopOnly: true,
  },
  {
    order: 46,
    id: 'cardinal-drone',
    label: 'Cardinal Drone',
    description: 'Play a prepared modular instrument, shape its sound, or open the rack',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'Slow Sky',
    desktopOnly: true,
  },
  {
    order: 46.5,
    id: 'garden',
    label: 'Garden',
    description:
      'A garden other people belong to — invite from the directory, share cruxes onto its shelf, leave notes; its Store and functions are the backend',
    icon: <HomeIcon />,
    thumb: <BlankThumb />,
    kind: 'garden',
    defaultTitle: 'Our garden',
    v2: true,
  },
  {
    order: 47,
    id: 'order-desk',
    label: 'Order Desk',
    description:
      'Functions + Store example — a public demo order queue with validation, events and owner actions in the workspace',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'My Order Desk',
  },
  {
    order: 48,
    id: 'private-requests',
    label: 'Private Requests',
    description:
      'Functions + Store — signed-in customers keep a private request; the owner reads and handles the inbox',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'My Private Requests',
  },
  {
    order: 49,
    id: 'onebigsky',
    label: 'One Big Sky',
    description: 'Play a flying arcade game with friends or bots, then make it your own',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'One Big Sky',
    desktopOnly: true,
  },
  {
    order: 50,
    id: 'astro-empty',
    label: 'Empty (Astro)',
    description: 'A real Astro project with one page — bring your own plan',
    icon: <LayoutIcon />,
    thumb: <BlankThumb />,
    kind: 'webapp',
    defaultTitle: 'My Site',
    desktopOnly: true,
  },
  {
    order: 51,
    id: 'astro-homepage',
    label: 'Astro Home Page',
    description:
      'Your page on the internet on the Keel theme — name, about, works, writing, search',
    icon: <HomeIcon />,
    thumb: <HomeThumb />,
    kind: 'webapp',
    defaultTitle: 'My Home Page',
    desktopOnly: true,
  },
  {
    order: 51.4,
    id: 'zen-vibecoding',
    label: 'Zen of Vibecoding',
    description: 'Learn Tasks and agents through a small playable garden',
    icon: <HomeIcon />,
    thumb: <HomeThumb />,
    kind: 'webapp',
    defaultTitle: 'Crux Garden: The Zen of Vibecoding',
    desktopOnly: true,
  },
  {
    order: 51.5,
    id: 'documentation',
    label: 'Documentation',
    description: 'A Starlight field guide — readable pages, navigation, search and a journal',
    icon: <PencilIcon />,
    thumb: <BlogThumb />,
    kind: 'webapp',
    defaultTitle: 'My Field Guide',
    desktopOnly: true,
  },
  {
    order: 52,
    id: 'astro-blog',
    label: 'Astro Blog',
    description: 'A real Astro site on the Cactus theme — posts, notes, tags, search, dark mode',
    icon: <PencilIcon />,
    thumb: <BlogThumb />,
    kind: 'webapp',
    defaultTitle: 'My Blog',
    desktopOnly: true,
  },
  {
    order: 53,
    id: 'astro-recipes',
    label: 'Recipe Book',
    description:
      'Recipes with times, servings, ingredients and steps on the Keel theme — printable, searchable',
    icon: <PencilIcon />,
    thumb: <BlogThumb />,
    kind: 'webapp',
    defaultTitle: 'My Recipe Book',
    desktopOnly: true,
  },
  {
    order: 54,
    id: 'astro-storefront',
    label: 'Storefront',
    description:
      'A small shop on the Keel theme — products with prices, a buy link or a Snipcart cart, a blog',
    icon: <PencilIcon />,
    thumb: <BlogThumb />,
    kind: 'webapp',
    defaultTitle: 'My Shop',
    desktopOnly: true,
  },
  {
    order: 55,
    id: 'digital-garden',
    label: 'Digital Garden',
    description:
      'A garden of linked notes on Astro — wikilinks, growth stages, backlinks, a graph, search',
    icon: <PencilIcon />,
    thumb: <BlogThumb />,
    kind: 'webapp',
    defaultTitle: 'My Digital Garden',
    desktopOnly: true,
  },
  {
    order: 56,
    id: 'business-page',
    label: 'Business Page',
    description: 'A business site on Astro — what you do, pricing, questions, news and contact',
    icon: <LayoutIcon />,
    thumb: <BusinessThumb />,
    kind: 'webapp',
    defaultTitle: 'My Business',
    desktopOnly: true,
  },
  {
    order: 57,
    id: 'resume',
    label: 'Resume',
    description: 'A one-page resume on Astro — one Markdown file, prints to PDF',
    icon: <PencilIcon />,
    thumb: <ResumeThumb />,
    kind: 'webapp',
    defaultTitle: 'My Resume',
    desktopOnly: true,
  },
  {
    order: 58,
    id: 'photo-gallery',
    label: 'Photo Gallery',
    description:
      'Photographs on Astro — digital and film galleries, a photo-a-month calendar, a lightbox and a journal',
    icon: <LayoutIcon />,
    thumb: <GalleryThumb />,
    kind: 'webapp',
    defaultTitle: 'My Photographs',
    desktopOnly: true,
  },
  {
    order: 59,
    id: 'astro-feed',
    label: 'Astro Feed',
    description: 'A photo feed — profile, square grid, a page per picture',
    icon: <LayoutIcon />,
    thumb: <FeedThumb />,
    kind: 'webapp',
    defaultTitle: 'My Feed',
    desktopOnly: true,
  },
  {
    order: 60,
    id: 'astro-media',
    label: 'Astro Media',
    description: 'Share music and video — players, pages, ffmpeg conversion on import',
    icon: <LayoutIcon />,
    thumb: <MediaThumb />,
    kind: 'webapp',
    defaultTitle: 'My Media',
    desktopOnly: true,
  },
  {
    order: 61,
    id: FIVE_WS_TEMPLATE_ID,
    label: FIVE_WS_NAME,
    description: FIVE_WS_TAGLINE,
    icon: <LayoutIcon />,
    thumb: <FiveWsThumb />,
    kind: 'webapp',
    defaultTitle: FIVE_WS_NAME,
    desktopOnly: true,
  },
];
const ICONS: Record<ToolIcon, React.ReactNode> = {
  layout: <LayoutIcon />,
  pencil: <PencilIcon />,
  home: <HomeIcon />,
};
const templates = (): Template[] =>
  [
    ...OWN_TEMPLATES,
    ...toolManifests().map((m) => ({
      order: m.order,
      id: m.id,
      label: m.name,
      description: m.description,
      icon: ICONS[m.icon],
      thumb: <BlankThumb />,
      kind: m.kind,
      defaultTitle: m.defaultTitle,
      desktopOnly: m.desktopOnly,
    })),
  ].sort((a, b) => a.order - b.order);

/** The picker's entries as plain data — what plant_crux accepts (the Keeper's list_templates). */
// eslint-disable-next-line react-refresh/only-export-components
export function templateCatalog(): {
  kind: CruxKind;
  id: string;
  label: string;
  description: string;
  desktopOnly: boolean;
}[] {
  return templates().map((t) => ({
    kind: t.kind,
    id: t.id,
    label: t.label,
    description: t.description,
    desktopOnly: !!t.desktopOnly,
  }));
}

const START_HERE = [
  'blank',
  'hello-world',
  'notes',
  'whiteboard',
  'zen-vibecoding',
  'documentation',
];
function startingPointGroup(template: Template): string {
  if (START_HERE.includes(template.id)) return 'Start here';
  if (!isToolAvailable(template.id)) return 'Tools to install';
  return 'More starting points';
}
function startingPointKind(template: Template): string {
  if (template.id.startsWith('astro-') || ['hello-world', 'documentation'].includes(template.id))
    return 'Websites';
  if (template.kind === 'notes' || template.kind === 'document') return 'Writing';
  if (template.kind === 'image') return 'Visual';
  if (template.kind === 'page') return 'Websites';
  return 'Apps and tools';
}

// ── Component ────────────────────────────────────────────

interface NewCruxModalProps {
  requestedImport?: { name: string; read: () => Promise<File> };
  initialView?: 'crux' | 'undertakings';
  open: boolean;
  onClose: () => void;
}

export default function NewCruxModal({
  open,
  onClose,
  initialView = 'crux',
  requestedImport,
}: NewCruxModalProps) {
  const TEMPLATES = templates();
  const [view, setView] = useState(initialView);
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);
  const [cruxStore] = useState(() => createCruxStore());
  const navigate = useMoodNavigate();
  const createCrux = cruxStore.getState().createCrux;
  const refresh = useGardenStore((s) => s.refresh);

  const [title, setTitle] = useState('My Crux');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [includeUninstalled, setIncludeUninstalled] = useState(false);
  // Until the user types a title, it follows the selected template's default
  const [titleEdited, setTitleEdited] = useState(false);
  const [idea, setIdea] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');
  // Chosen from the list by hand: the idea stops choosing for the person.
  const [pickedByHand, setPickedByHand] = useState(false);
  const aiEnabled = useAiEnabled();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  // Installed tools count as available; re-render as one arrives (Explore → Install).
  const installed = useInstalledTools();
  const template = (TEMPLATES.find((t) => t.id === selectedTemplate) ?? TEMPLATES[0])!;
  const supported = TEMPLATES.filter(
    (item) => (!item.desktopOnly || can(Capability.Build)) && (!item.v2 || can(Capability.V2)),
  );
  const choices = supported
    .filter(
      (item) =>
        (includeUninstalled || isToolAvailable(item.id)) &&
        (category === 'All' || startingPointKind(item) === category) &&
        `${item.label} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const groups = ['Start here', 'More starting points', 'Tools to install'];
      return (
        groups.indexOf(startingPointGroup(a)) - groups.indexOf(startingPointGroup(b)) ||
        a.order - b.order
      );
    });
  const selectionVisible = choices.some((item) => item.id === selectedTemplate);
  const uninstalledCount = supported.filter((item) => !isToolAvailable(item.id)).length;

  // One question: the idea picks where the Crux starts and what it is called,
  // until the person picks or names it themselves (lib/infer-starting-point).
  const onIdeaChange = (next: string) => {
    setIdea(next);
    let startsAs = template;
    if (!pickedByHand) {
      const offered = TEMPLATES.filter(
        (t) =>
          isToolAvailable(t.id) &&
          (!t.desktopOnly || can(Capability.Build)) &&
          (!t.v2 || can(Capability.V2)),
      );
      const inferred = inferStartingPoint(next, offered) ?? 'blank';
      startsAs = (TEMPLATES.find((t) => t.id === inferred) ?? TEMPLATES[0])!;
      setSelectedTemplate(startsAs.id);
    }
    if (!titleEdited) setTitle(nameFromIdea(next) || startsAs.defaultTitle || 'My Crux');
  };

  const reset = () => {
    setTitle('My Crux');
    setTitleEdited(false);
    setPickedByHand(false);
    setIdea('');
    setCreateError(null);
    setSelectedTemplate('blank');
    setSearch('');
    setCategory('All');
    setIncludeUninstalled(false);
    setCreating(false);
  };

  const handleImport = useCallback(
    async (file: File) => {
      const origin = window.location.href;
      const gardenId = captureGardenId();
      setImporting(true);
      setImportProgress({ done: 0, total: 0 });

      try {
        if (file.name.toLowerCase().endsWith('.cruxtool')) {
          const tool = await installToolFile(file);
          setSelectedTemplate(tool.id);
          void alertDialog(
            `${tool.manifest!.name} is installed. Create from it here whenever you like.`,
            'Tool installed',
          );
          refresh();
          return;
        }
        if (file.name.toLowerCase().endsWith('.cruxmood')) {
          const mood = await installMoodFile(file, gardenId);
          void alertDialog(
            `“${mood.name}” is installed. Open Moods to preview and keep it for your Garden.`,
            'Mood installed',
          );
          refresh();
          return;
        }
        const result = await importCrux({
          data: file,
          gardenId,
          mode: 'clone',
          onProgress: (done, total) => setImportProgress({ done, total }),
        });

        // A Crux Tool's package (its Template Crux, `meta.template` a tool
        // this build lacks) installs the tool instead of opening as a Crux:
        // the Crux becomes the tool's Template Crux and the picker's Create works.
        const imported = await getServices().crux.findById(result.cruxId);
        if (imported.kind === 'garden') {
          // Garden payload belongs to the imported Garden. It must not become the
          // destination's editor layout, tool installation or global appearance.
          refresh();
          reset();
          onClose();
          if (window.location.href === origin) navigate(cruxPath(imported, gardenId));
          return;
        }
        const installation = await installImportedCreation(result.cruxId, gardenId);
        if (installation) {
          refresh();
          if (installation.kind === 'tool') setSelectedTemplate(installation.id);
          void alertDialog(
            installation.kind === 'tool'
              ? `${installation.name} is installed. Create from it here whenever you like.`
              : `${installation.name} is installed. Open Moods to preview and keep it for your Garden.`,
            installation.kind === 'tool' ? 'Tool installed' : 'Mood installed',
          );
          return;
        }

        if (!result.layout && isEmbeddedApp(await getServices().crux.findById(result.cruxId)))
          useUIStore.getState().seedCruxLayout(result.cruxId, 27);

        if (result.layout) {
          const layout = result.layout;
          if (layout.paneOrder && layout.paneVisibility) {
            setSetting(
              `cruxgarden:layout:${result.cruxId}`,
              JSON.stringify({
                paneOrder: layout.paneOrder,
                paneVisibility: layout.paneVisibility,
              }),
            );
          }
          if (layout.editorTabs) {
            setSetting(
              `cruxgarden:editor-tabs:${result.cruxId}`,
              JSON.stringify(layout.editorTabs),
            );
          }
          if (layout.folderState) {
            setSetting(
              `cruxgarden:folder-state:${result.cruxId}`,
              JSON.stringify(layout.folderState),
            );
          }
        }

        if (result.theme) {
          if (result.theme.mode) setSetting(SettingsKey.Theme, result.theme.mode);
          if (result.theme.tint) setSetting(SettingsKey.Tint, result.theme.tint);
        }

        if (result.failedArtifacts.length > 0) {
          console.warn('Some artifacts failed to import:', result.failedArtifacts);
          void alertDialog(
            `Import completed with ${result.failedArtifacts.length} file${result.failedArtifacts.length > 1 ? 's' : ''} that could not be restored.`,
            'Import finished with warnings',
          );
        }

        refresh();
        reset();
        onClose();
        if (window.location.href === origin) navigate(cruxPath(imported, gardenId));
      } catch (err) {
        console.error('Import failed:', err);
        void alertDialog(
          `Failed to import package: ${plainError(err, 'Make sure it is a valid export.')}`,
          'Import failed',
        );
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

  const startFileRef = useRef<HTMLInputElement>(null);
  const handleStartFromFiles = useCallback(
    async (files: File[]) => {
      const origin = window.location.href;
      const gardenId = captureGardenId();
      if (creating || importing) return;
      setCreateError(null);
      setCreating(true);
      try {
        const { cruxId } = await startFromFiles(
          files.map((file) => ({ path: file.name, file })),
          null,
          gardenId,
        );
        reset();
        onClose();
        if (window.location.href === origin) navigate(inGarden(`/c/${cruxId}`, gardenId));
      } catch (err) {
        setCreateError(plainError(err, 'Could not start from that file.'));
        setCreating(false);
      }
    },
    [creating, importing, navigate, onClose],
  );

  const handleCreate = async (quickStart = false) => {
    const origin = window.location.href;
    const gardenId = captureGardenId();
    if (creating || importing || (!quickStart && !selectionVisible)) return;
    if (!quickStart && !isToolAvailable(template.id)) {
      setCreateError(`${template.label} is not included in this build.`);
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const effectiveTitle = quickStart
        ? undefined
        : title.trim() || template.defaultTitle || undefined;

      const crux = await createCrux(effectiveTitle, gardenId);

      if (!quickStart && template.id !== 'blank') {
        const applied = await applyTemplateToCrux(crux, template.id, template.kind);
        // Reflect the template's greeting immediately (loadCrux reads it later too)
        if (applied.messages) cruxStore.getState().setMessages(applied.messages);
      }

      useUIStore
        .getState()
        .seedCruxLayout(
          crux.id,
          !quickStart && template.id === 'notes'
            ? 27
            : !quickStart &&
                (['moqira', 'onebigsky', 'cardinal-drone'].includes(template.id) ||
                  template.id.startsWith('tool-'))
              ? 22
              : undefined,
        );
      if (idea.trim()) {
        // The idea is what the Crux is for: its description, whoever does the work.
        await cruxStore
          .getState()
          .updateCrux({ description: idea.trim().slice(0, 280) })
          .catch((err) => console.warn('[new-crux] description not saved:', err));
        // With a collaborator, it also waits in Collaboration, ready to send.
        if (aiEnabled) setSetting(`cruxgarden:composer:${crux.id}`, idea.trim());
      }

      reset();
      onClose();
      if (window.location.href === origin) navigate(inGarden(`/c/${crux.id}`, gardenId));
    } catch (err) {
      // A crux row may already exist at this point (see the create → template
      // → update sequence above); the user must be told rather than left
      // staring at a spinner that quietly stopped.
      console.error('[new-crux] creation failed:', err);
      setCreateError(err instanceof Error ? err.message : 'Could not create the crux.');
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating || importing) return;
    reset();
    onClose();
  };

  const inputClass = fieldClass();

  if (view === 'undertakings')
    return (
      <Modal open={open} onClose={handleClose} size="screen" title="Add Crux">
        <button
          disabled={creating}
          className={buttonClass('ghost', 'sm', 'self-start -ml-3 mb-3')}
          onClick={() => setView('crux')}
        >
          Just a Crux — one project
        </button>
        <Suspense fallback={<p role="status">Loading starting points…</p>}>
          <Undertakings
            onBusy={setCreating}
            onStarted={() => {
              reset();
              onClose();
            }}
          />
        </Suspense>
      </Modal>
    );
  if (requestedImport)
    return (
      <Modal open={open} onClose={handleClose} title="Import downloaded package">
        <div className="space-y-4">
          <p>
            Import <strong>{requestedImport.name}</strong> into{' '}
            <strong>{useGardenContext.getState().garden?.title || 'this Garden'}</strong>?
          </p>
          <p className="text-sm text-text-muted">
            Cruxes become independent projects. Tools and Moods are installed in your library. Your
            existing work stays here.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={importing} onClick={handleClose}>
              Cancel
            </Button>
            <Button
              loading={importing}
              onClick={() => {
                setImporting(true);
                void requestedImport
                  .read()
                  .then(handleImport)
                  .catch((error) =>
                    alertDialog(plainError(error, 'Could not read this package.'), 'Import failed'),
                  )
                  .finally(() => {
                    setImporting(false);
                    onClose();
                  });
              }}
            >
              Import package
            </Button>
          </div>
        </div>
      </Modal>
    );
  return (
    <Modal open={open} onClose={handleClose} size="screen" title="Add Crux">
      <div className="flex flex-col min-h-0 h-full gap-4">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
          <div className="shrink-0 space-y-2">
            <label htmlFor="new-crux-idea" className="block text-lg font-medium">
              What do you want to make?
            </label>
            <textarea
              id="new-crux-idea"
              value={idea}
              onChange={(e) => onIdeaChange(e.target.value)}
              onKeyDown={(e) => {
                // Enter creates; Shift+Enter keeps writing.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="A tiny game, a page for my project, a reading list…"
              disabled={creating || importing}
              rows={2}
              autoFocus
              className={cn(inputClass, 'h-auto py-2 resize-y')}
            />
            <p className="text-xs text-text-muted" data-testid="new-crux-starts-as">
              {idea.trim() ? (
                <>
                  Starts as <span className="text-text">{template.label}</span>, named{' '}
                  <span className="text-text">
                    {title.trim() || template.defaultTitle || 'My Crux'}
                  </span>
                  {aiEnabled ? ' · the idea waits in Collaboration, ready to send.' : '.'}
                </>
              ) : (
                'Describe it in a few words and press Enter, or choose where it starts below.'
              )}
            </p>
            <button
              disabled={creating || importing}
              className={linkClass('text-sm')}
              onClick={() => setView('undertakings')}
            >
              Undertakings — a collection of related projects
            </button>
          </div>
          {/* Name */}
          <div className="shrink-0">
            <SectionLabel htmlFor="new-crux-name" as="label" tone="muted" className="mb-2">
              Name
            </SectionLabel>
            <input
              id="new-crux-name"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              onFocus={(e) => e.target.select()}
              placeholder={template.defaultTitle || 'My Crux'}
              disabled={creating}
              className={inputClass}
            />
          </div>

          {/* One scrolling body keeps choices reachable in short windows. */}
          <div className="flex flex-col">
            <SectionLabel as="label" tone="muted" className="mb-2 shrink-0">
              Or choose where it starts
            </SectionLabel>
            <div className="flex flex-wrap gap-2 mb-2 shrink-0">
              <input
                aria-label="Find a starting point"
                placeholder="Search starting points…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={fieldClass(undefined, 'flex-1 min-w-32')}
              />
              <select
                aria-label="Starting point category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className={fieldClass(undefined, 'w-auto')}
              >
                {['All', 'Websites', 'Writing', 'Visual', 'Apps and tools'].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>
            {uninstalledCount > 0 && (
              <label className="mb-2 flex items-center gap-2 text-xs text-text-muted shrink-0">
                <input
                  type="checkbox"
                  checked={includeUninstalled}
                  onChange={(event) => setIncludeUninstalled(event.target.checked)}
                />
                Include tools to install ({uninstalledCount})
              </label>
            )}
            <div className="pr-0.5">
              <div className="flex flex-col">
                {choices.length === 0 && (
                  <p className="p-3 text-sm text-text-muted">
                    No starting points match. Try another search or include tools to install.
                  </p>
                )}
                {choices.map((t, index) => (
                  <Fragment key={t.id}>
                    {(!choices[index - 1] ||
                      startingPointGroup(choices[index - 1]!) !== startingPointGroup(t)) && (
                      <h3 className="px-3 pt-3 pb-1 text-xs font-medium text-text-muted">
                        {startingPointGroup(t)}
                      </h3>
                    )}
                    <button
                      data-template-id={t.id}
                      onClick={() => {
                        setSelectedTemplate(t.id);
                        setPickedByHand(true);
                        if (!titleEdited && !idea.trim() && t.defaultTitle) {
                          setTitle(t.defaultTitle);
                        }
                      }}
                      disabled={creating}
                      aria-pressed={selectedTemplate === t.id}
                      className={cn(
                        'w-full px-3 py-2.5 text-left cursor-pointer rounded-[var(--radius-sm)]',
                        'flex items-center gap-3 transition-colors',
                        'disabled:cursor-not-allowed',
                        selectedTemplate === t.id
                          ? 'bg-accent-muted/(--tint-muted)'
                          : 'hover:bg-action-button-hover',
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center',
                          selectedTemplate === t.id
                            ? 'bg-accent-muted text-accent'
                            : 'bg-surface text-text-muted',
                        )}
                        aria-hidden
                      >
                        {t.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            'text-sm font-body font-medium block truncate',
                            selectedTemplate === t.id ? 'text-accent' : 'text-text',
                          )}
                        >
                          {t.label}
                          {!isToolAvailable(t.id) && (
                            <span className="ml-2 text-2xs font-mono text-text-muted">
                              not installed
                            </span>
                          )}
                        </span>
                        {t.description && (
                          <span className="text-xs text-text-muted block truncate">
                            {t.description}
                          </span>
                        )}
                      </div>
                    </button>
                  </Fragment>
                ))}
              </div>
            </div>
            {!selectionVisible && (
              <p className="mt-2 text-xs text-text-muted">
                Choose a starting point from these results.
              </p>
            )}
            {installed[template.id] && (
              <Button
                variant="secondary"
                size="sm"
                disabled={creating || importing}
                onClick={() => {
                  forgetInstalledTool(template.id);
                  setSelectedTemplate('blank');
                  setSearch('');
                }}
              >
                Remove installed tool
              </Button>
            )}
            {installed[template.id] && (
              <p className="text-xxs text-text-muted mt-1.5">
                Removes this starting point. Your existing Cruxes and their files stay intact.
              </p>
            )}
            {!isToolAvailable(template.id) ? (
              <p
                className="text-xxs text-text-muted mt-1.5 shrink-0"
                data-testid="tool-not-bundled"
              >
                {template.label} is not installed. Install it from Explore, or from its .cruxtool
                package, to create from it.
              </p>
            ) : (
              template.id !== 'blank' && (
                <p className="text-xxs text-text-muted mt-1.5 shrink-0">{template.description}</p>
              )
            )}
          </div>
        </div>

        {/* Actions — pinned to bottom */}
        <div className="shrink-0 flex items-center gap-1 border-t border-border pt-4">
          <input
            ref={importInputRef}
            type="file"
            accept=".crux,.cruxtool,.cruxmood,.zip"
            className="hidden"
            onChange={handleImportInput}
          />
          {importing ? (
            <div className="flex items-center gap-3">
              <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
                <svg width="24" height="24" viewBox="0 0 28 28" className="-rotate-90">
                  <circle
                    cx="14"
                    cy="14"
                    r="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-border"
                  />
                  <circle
                    cx="14"
                    cy="14"
                    r="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="text-accent transition-[stroke-dashoffset] [transition-duration:var(--motion-ms-slow)]"
                    strokeDasharray={2 * Math.PI * 12}
                    strokeDashoffset={
                      importProgress.total > 0
                        ? 2 * Math.PI * 12 * (1 - importProgress.done / importProgress.total)
                        : 2 * Math.PI * 12
                    }
                  />
                </svg>
                <span className="absolute text-[8px] font-mono text-text-muted">
                  {importProgress.total > 0
                    ? Math.round((importProgress.done / importProgress.total) * 100)
                    : 0}
                </span>
              </div>
              <span className="text-xs font-mono text-text-muted">Importing...</span>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3"
              onClick={() => importInputRef.current?.click()}
              disabled={creating}
            >
              Import Crux, tool or Mood
            </Button>
          )}
          <input
            ref={startFileRef}
            type="file"
            multiple
            className="hidden"
            aria-label="Start from a file"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void handleStartFromFiles(files);
            }}
          />
          {!importing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => startFileRef.current?.click()}
              disabled={creating}
              title="A document, image, sound, video, PDF, notebook or project file becomes a Crux in the tool that opens it"
            >
              Start from a file…
            </Button>
          )}
          {isToolAvailable(template.id) ? (
            <Button
              className="ml-auto min-w-24"
              onClick={() => handleCreate()}
              loading={creating}
              disabled={importing || !selectionVisible}
            >
              Create
            </Button>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => importInputRef.current?.click()}
                disabled={creating || importing}
              >
                Install from .crux…
              </Button>
              <Button
                onClick={() => {
                  onClose();
                  useUIStore.getState().openExplore('tool');
                }}
                disabled={creating || importing}
              >
                Install from Explore
              </Button>
            </div>
          )}
        </div>
        {createError && (
          <p role="alert" className="mt-2 text-xs text-error">
            {createError}
          </p>
        )}
      </div>
    </Modal>
  );
}
