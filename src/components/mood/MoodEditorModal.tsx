import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { getCurrentMoodPalette, getVar, GARDEN_DARK, type MoodPalette } from '@/lib/moods';
import { useMoodStore, type MoodMeta, type MoodPersona } from '@/stores/moodStore';
import { pixelateImageToDataURL } from '@/lib/pixelate';
import { Spinner } from '@/components/ui';

// ── Types ────────────────────────────────────────────

type Tab = 'palette' | 'persona' | 'background' | 'details';

interface MoodEditorModalProps {
  open: boolean;
  onClose: () => void;
  moodId: string | null; // null = creating new
}

// ── Palette block definitions ────────────────────────

interface PaletteToken {
  key: keyof MoodPalette;
  label: string;
}

interface PaletteBlock {
  id: string;
  label: string;
  description: string;
  tokens: PaletteToken[];
}

/** Auto-generate human-readable label from camelCase key */
function keyToLabel(key: string, prefix: string): string {
  const stripped = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  if (!stripped) return 'Base';
  return stripped.replace(/([A-Z])/g, ' $1').trim();
}

/** Build a palette block from a prefix match on Garden Dark keys */
function buildBlock(id: string, label: string, description: string, prefix: string, keys: string[]): PaletteBlock {
  const tokens = keys
    .filter((k) => k === prefix || k.startsWith(prefix))
    .filter((k) => {
      const val = (GARDEN_DARK as Record<string, string>)[k];
      // Skip non-color values (numbers, lengths, font families, empty)
      if (!val) return false;
      if (/^\d/.test(val) || val.includes('rem') || val.includes('monospace') || val.includes('sans-serif')) return false;
      return true;
    })
    .map((k) => ({ key: k as keyof MoodPalette, label: keyToLabel(k, prefix) }));
  return { id, label, description, tokens };
}

const ALL_KEYS = Object.keys(GARDEN_DARK);

const PALETTE_BLOCKS: PaletteBlock[] = [
  buildBlock('global', 'Global', 'Page background and text', 'bg', ['bg', 'text', 'textMuted', 'highlight', 'border']),
  buildBlock('typography', 'Typography', 'Headings, links, captions', 'title', ALL_KEYS.filter(k => ['title','heading','paragraph','caption','link','linkHover','linkVisited','linkActive'].includes(k))),
  buildBlock('panel', 'Panel', 'Sidebars, modals, content areas', 'panel', ALL_KEYS),
  buildBlock('surface', 'Surface', 'Cards and containers', 'surface', ALL_KEYS),
  buildBlock('overlay', 'Overlay', 'Modals, dropdowns, popovers', 'overlay', ALL_KEYS),
  buildBlock('toolbar', 'Toolbar', 'Top bar, action bars', 'toolbar', ALL_KEYS),
  buildBlock('input', 'Input', 'Text inputs, search, textareas', 'input', [...ALL_KEYS.filter(k => k.startsWith('input')), 'placeholder']),
  buildBlock('action-button', 'Action Button', 'Minimal buttons for settings', 'actionButton', ALL_KEYS),
  buildBlock('icon-button', 'Icon Button', 'Pronounced action buttons', 'iconButton', ALL_KEYS),
  buildBlock('primary-button', 'Primary Button', 'Call-to-action buttons', 'primaryButton', ALL_KEYS),
  buildBlock('danger-button', 'Danger Button', 'Destructive action buttons', 'dangerButton', ALL_KEYS),
  buildBlock('profile-button', 'Profile Button', 'User avatar/menu trigger', 'profileButton', ALL_KEYS),
  buildBlock('chat', 'Chat', 'Conversation messages and input', 'chat', ALL_KEYS),
  buildBlock('code', 'Code', 'Code blocks and syntax highlighting', 'code', [...ALL_KEYS.filter(k => k.startsWith('code') || k.startsWith('syntax'))]),
  buildBlock('file-tree', 'File Tree', 'Artifact file browser', 'fileTree', ALL_KEYS),
  buildBlock('growth', 'Growth Timeline', 'Version history', 'growth', ALL_KEYS),
  buildBlock('garden-card', 'Garden Cards', 'Crux cards on home page', 'gardenCard', ALL_KEYS),
  buildBlock('keeper', 'Keeper Console', 'The Keeper modal', 'keeperConsole', ALL_KEYS),
  buildBlock('pane-collab', 'Collaboration Pane', 'Chat pane colors', 'paneCollaboration', ALL_KEYS),
  buildBlock('pane-artifacts', 'Artifacts Pane', 'File tree pane colors', 'paneArtifacts', ALL_KEYS),
  buildBlock('pane-workshop', 'Workshop Pane', 'Code editor pane colors', 'paneWorkshop', ALL_KEYS),
  buildBlock('pane-details', 'Metadata Pane', 'Details pane colors', 'paneDetails', ALL_KEYS),
  buildBlock('pane-history', 'History Pane', 'Timeline pane colors', 'paneHistory', ALL_KEYS),
  buildBlock('pane-export', 'Export Pane', 'Export pane colors', 'paneExport', ALL_KEYS),
  buildBlock('pane-sync', 'Sync Pane', 'Sync pane colors', 'paneSync', ALL_KEYS),
  buildBlock('pane-publish', 'Publish Pane', 'Publish pane colors', 'panePublish', ALL_KEYS),
  buildBlock('pane-store', 'Store Pane', 'Store pane colors', 'paneStore', ALL_KEYS),
  buildBlock('tooltip', 'Tooltip', 'Tooltips and hints', 'tooltip', ALL_KEYS),
  buildBlock('mood-bar', 'Mood Bar', 'Background selector bar', 'moodBar', ALL_KEYS),
  buildBlock('badge', 'Badge', 'Tags, chips, indicators', 'badge', ALL_KEYS),
  buildBlock('scrollbar', 'Scrollbar', 'Browser scrollbar', 'scrollbar', ALL_KEYS),
  buildBlock('selection', 'Selection', 'Text and item selection', 'selection', ALL_KEYS),
  buildBlock('drag', 'Drag & Drop', 'Drop zones, resize handles', 'drag', ALL_KEYS),
  buildBlock('spinner', 'Loading', 'Spinners and indicators', 'spinner', ALL_KEYS),
  buildBlock('error', 'Error', 'Error states', 'error', ALL_KEYS),
  buildBlock('warning', 'Warning', 'Caution states', 'warning', ALL_KEYS),
  buildBlock('success', 'Success', 'Positive states', 'success', ALL_KEYS),
  buildBlock('bloom', 'Bloom', 'Background gradient blobs', 'bloom', ALL_KEYS),
  buildBlock('ambient', 'Ambient', 'Flow, drift, starfield', 'flow', [...ALL_KEYS.filter(k => k.startsWith('flow') || k.startsWith('drift') || k.startsWith('star'))]),
  buildBlock('chrome', 'Chrome', 'Contrast, brand, misc', 'contrast', ['contrast', 'previewBg', 'brandAi', 'accent', 'accentMuted']),
  buildBlock('public-top-bar', 'Public Top Bar', 'Public display header', 'publicTopBar', ALL_KEYS),
  buildBlock('toggle', 'Toggle', 'Switch controls', 'toggle', ALL_KEYS),
  buildBlock('dropdown', 'Dropdown', 'Select menus', 'dropdown', ALL_KEYS),
  buildBlock('model-selector', 'Model Selector', 'AI model picker', 'modelSelector', ALL_KEYS),
  buildBlock('snapshot-banner', 'Snapshot Banner', 'Version viewing indicator', 'snapshotBanner', ALL_KEYS),
  buildBlock('command-palette', 'Command Palette', 'Cmd+K search', 'commandPalette', ALL_KEYS),
  buildBlock('avatar', 'Avatar', 'User/AI avatars', 'avatar', ALL_KEYS),
  buildBlock('markdown', 'Markdown', 'Rendered markdown content', 'markdown', ALL_KEYS),
  buildBlock('landing', 'Landing Page', 'Welcome/setup screen', 'landing', ALL_KEYS),
  buildBlock('settings', 'Settings', 'Settings page sections', 'settings', ALL_KEYS),
].filter(b => b.tokens.length > 0);

// ── Icons ────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Collapsible palette section ──────────────────────

function PaletteSection({
  block,
  draft,
  basePalette,
  onChangeColor,
  isOpen,
  onToggle,
}: {
  block: PaletteBlock;
  draft: Partial<MoodPalette>;
  basePalette: MoodPalette;
  onChangeColor: (key: keyof MoodPalette, value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const open = isOpen;

  // Color swatches for the collapsed preview
  const swatches = block.tokens.slice(0, 8).map(({ key }) => draft[key] || basePalette[key]);

  return (
    <div className="border border-border/50 rounded-[var(--radius-sm)] overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 bg-[#222222] hover:bg-[#282828] transition-colors cursor-pointer"
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={cn('text-text-muted transition-transform duration-150 shrink-0', open ? 'rotate-0' : '-rotate-90')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="text-sm font-display font-medium text-text">{block.label}</span>
        <span className="text-xs font-mono text-text-muted">{block.description}</span>
        <div className="flex-1" />
        {/* Collapsed swatch preview */}
        {!open && (
          <div className="flex gap-0.5">
            {swatches.map((color, i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-[3px] border border-border/30"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
      </button>

      {/* Table — visible when expanded */}
      {open && (
        <table className="w-full text-sm font-mono">
          <tbody>
            {block.tokens.map(({ key, label }, i) => {
              const value = draft[key] || basePalette[key] || '';
              const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value);
              return (
                <tr key={key} className={i % 2 === 0 ? 'bg-[#202020]' : 'bg-[#1a1a1a]'}>
                  <td className="px-4 py-2.5 w-14">
                    <label
                      className="relative w-8 h-8 rounded-[4px] border border-border/40 block cursor-pointer overflow-hidden hover:border-accent/50 transition-colors"
                      style={{ backgroundColor: value }}
                    >
                      <input
                        type="color"
                        value={isHex ? value : '#000000'}
                        onChange={(e) => onChangeColor(key, e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </label>
                  </td>
                  <td className="px-4 py-2.5 text-text">{label}</td>
                  <td className="px-4 py-2.5 text-text-muted truncate max-w-[200px]">{value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Tab: Palette ─────────────────────────────────────

function PaletteTab({
  draft,
  basePalette,
  onChangeColor,
  activeSection,
  onActiveSection,
}: {
  draft: Partial<MoodPalette>;
  basePalette: MoodPalette;
  onChangeColor: (key: keyof MoodPalette, value: string) => void;
  activeSection: string | null;
  onActiveSection: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {PALETTE_BLOCKS.map((block) => (
        <PaletteSection
          key={block.id}
          block={block}
          draft={draft}
          basePalette={basePalette}
          onChangeColor={onChangeColor}
          isOpen={activeSection === block.id}
          onToggle={() => onActiveSection(activeSection === block.id ? null : block.id)}
        />
      ))}
    </div>
  );
}

// ── Tab: Persona ─────────────────────────────────────

function PersonaTab({
  persona,
  onChange,
}: {
  persona: MoodPersona;
  onChange: (p: Partial<MoodPersona>) => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Name</label>
        <input
          value={persona.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="px-3 py-2 text-sm font-mono bg-surface-solid border border-border rounded-[var(--radius-sm)] text-text focus:outline-none focus:border-accent"
          placeholder="The Keeper"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Description</label>
        <input
          value={persona.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="px-3 py-2 text-sm font-mono bg-surface-solid border border-border rounded-[var(--radius-sm)] text-text focus:outline-none focus:border-accent"
          placeholder="Your creative companion"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Greeting</label>
        <input
          value={persona.greeting}
          onChange={(e) => onChange({ greeting: e.target.value })}
          className="px-3 py-2 text-sm font-mono bg-surface-solid border border-border rounded-[var(--radius-sm)] text-text focus:outline-none focus:border-accent"
          placeholder="What would you like to create today?"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">System Prompt</label>
        <textarea
          value={persona.systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
          rows={8}
          className="px-3 py-2 text-sm font-mono bg-surface-solid border border-border rounded-[var(--radius-sm)] text-text focus:outline-none focus:border-accent resize-y"
          placeholder="You are a creative AI assistant..."
        />
        <span className="text-[10px] text-text-muted/60">
          Defines the AI's personality and behavior when this mood is active
        </span>
      </div>
    </div>
  );
}

// ── Tab: Background ──────────────────────────────────

type BgType = 'bloom' | 'flowfield' | 'drift' | 'blank' | 'image';

function BackgroundTab({
  bgType,
  onChangeBgType,
  bgImagePreview,
  bgBlockSize,
  onBgImageSelect,
  onBgBlockSizeChange,
  onBgImageClear,
  bgGenerating,
}: {
  bgType: BgType;
  onChangeBgType: (t: BgType) => void;
  bgImagePreview: string | null;
  bgBlockSize: number;
  onBgImageSelect: (file: File) => void;
  onBgBlockSizeChange: (size: number) => void;
  onBgImageClear: () => void;
  bgGenerating: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const animatedOptions: { value: BgType; label: string; description: string }[] = [
    { value: 'bloom', label: 'Bloom', description: 'Animated gradient blobs' },
    { value: 'drift', label: 'Drift', description: 'Floating particles' },
    { value: 'flowfield', label: 'Flow', description: 'Organic wave patterns' },
    { value: 'blank', label: 'Blank', description: 'Solid background color' },
  ];

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Animated</label>
        <div className="grid grid-cols-2 gap-2">
          {animatedOptions.map(({ value, label, description }) => (
            <button
              key={value}
              onClick={() => onChangeBgType(value)}
              className={cn(
                'flex flex-col gap-0.5 px-3 py-2.5 rounded-[var(--radius-sm)] border text-left transition-colors cursor-pointer',
                bgType === value
                  ? 'bg-accent-muted border-accent/30 text-accent'
                  : 'bg-surface border-border text-text-muted hover:border-accent/20 hover:text-text',
              )}
            >
              <span className="text-xs font-mono font-medium">{label}</span>
              <span className="text-[10px] opacity-60">{description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Image</label>
        <button
          onClick={() => {
            onChangeBgType('image');
            fileRef.current?.click();
          }}
          className={cn(
            'flex flex-col gap-0.5 px-3 py-2.5 rounded-[var(--radius-sm)] border text-left transition-colors cursor-pointer',
            bgType === 'image'
              ? 'bg-accent-muted border-accent/30 text-accent'
              : 'bg-surface border-border text-text-muted hover:border-accent/20 hover:text-text',
          )}
        >
          <span className="text-xs font-mono font-medium">Image</span>
          <span className="text-[10px] opacity-60">Upload a pixelated background</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onBgImageSelect(file);
            if (fileRef.current) fileRef.current.value = '';
          }}
        />

        {bgType === 'image' && bgImagePreview && (
          <div className="flex flex-col gap-2 mt-1 p-3 bg-[#202020] border border-border/50 rounded-[var(--radius-sm)]">
            <div className="relative w-full h-28 rounded-[var(--radius-sm)] overflow-hidden">
              <img
                src={bgImagePreview}
                alt="Background preview"
                className="w-full h-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
              {bgGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-bg/60">
                  <Spinner size={16} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted font-mono shrink-0">Pixel size</label>
              <input
                type="range"
                min={2}
                max={32}
                step={1}
                value={bgBlockSize}
                onChange={(e) => onBgBlockSizeChange(Number(e.target.value))}
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="text-xs text-text-muted font-mono w-6 text-right">{bgBlockSize}</span>
            </div>
            <button
              onClick={onBgImageClear}
              className="self-start text-xs text-error hover:text-error/80 transition-colors cursor-pointer"
            >
              Remove image
            </button>
          </div>
        )}

        {bgType === 'image' && !bgImagePreview && (
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-accent hover:text-accent/80 transition-colors cursor-pointer mt-1"
          >
            Choose an image...
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tab: Details ─────────────────────────────────────

function DetailsTab({
  title,
  description,
  tags,
  onChangeTitle,
  onChangeDescription,
  onChangeTags,
}: {
  title: string;
  description: string;
  tags: string[];
  onChangeTitle: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onChangeTags: (v: string[]) => void;
}) {
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChangeTags([...tags, tag]);
    }
    setTagInput('');
  };

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Name</label>
        <input
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          className="px-3 py-2 text-sm font-mono bg-surface-solid border border-border rounded-[var(--radius-sm)] text-text focus:outline-none focus:border-accent"
          placeholder="My Mood"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => onChangeDescription(e.target.value)}
          rows={3}
          className="px-3 py-2 text-sm font-mono bg-surface-solid border border-border rounded-[var(--radius-sm)] text-text focus:outline-none focus:border-accent resize-y"
          placeholder="A dark, focused environment for deep work..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Tags</label>
        <div className="flex items-center gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
            className="flex-1 px-3 py-2 text-sm font-mono bg-surface-solid border border-border rounded-[var(--radius-sm)] text-text focus:outline-none focus:border-accent"
            placeholder="Add tag..."
          />
          <button
            onClick={addTag}
            className="px-3 py-2 text-xs font-mono bg-surface border border-border rounded-[var(--radius-sm)] text-text-muted hover:text-accent hover:border-accent/30 transition-colors cursor-pointer"
          >
            Add
          </button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono bg-accent-muted text-accent rounded-[var(--radius-sm)]"
              >
                {tag}
                <button
                  onClick={() => onChangeTags(tags.filter((t) => t !== tag))}
                  className="hover:text-error cursor-pointer"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Tab navigation ───────────────────────────────────
// ── Tab navigation ───────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'palette', label: 'Palette' },
  { id: 'persona', label: 'Persona' },
  { id: 'background', label: 'Background' },
  { id: 'details', label: 'Details' },
];

// ── Main Component ───────────────────────────────────

export default function MoodEditorModal({ open, onClose, moodId }: MoodEditorModalProps) {
  const { createMood, updateMood, moods } = useMoodStore();
  const [tab, setTab] = useState<Tab>('palette');
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Draft state
  const [title, setTitle] = useState('New Mood');
  const [description, setDescription] = useState('');
  const [paletteOverrides, setPaletteOverrides] = useState<Partial<MoodPalette>>({});
  const [persona, setPersona] = useState<MoodPersona>({
    name: 'The Keeper',
    description: 'Your creative companion',
    systemPrompt: '',
    greeting: 'What would you like to create today?',
  });
  const [bgType, setBgType] = useState<BgType>('bloom');
  const [tags, setTags] = useState<string[]>([]);

  // Background image
  const [bgPendingFile, setBgPendingFile] = useState<File | null>(null);
  const [bgImagePreview, setBgImagePreview] = useState<string | null>(null);
  const [bgBlockSize, setBgBlockSize] = useState(8);
  const [bgGenerating, setBgGenerating] = useState(false);

  const basePalette = useRef(getCurrentMoodPalette()).current;

  // Load existing mood data when editing
  useEffect(() => {
    if (!open) return;
    if (moodId) {
      const mood = moods.find((m) => m.id === moodId);
      if (mood) {
        const meta = mood.meta as MoodMeta | undefined;
        setTitle(mood.title || 'Untitled Mood');
        setDescription(mood.description || '');
        setPaletteOverrides(meta?.palette || {});
        setPersona(meta?.persona || {
          name: 'The Keeper',
          description: 'Your creative companion',
          systemPrompt: '',
          greeting: 'What would you like to create today?',
        });
        setBgType((meta?.backgroundType as BgType) || 'bloom');
        setTags(meta?.tags || []);
        // Load existing background image from mood artifacts
        setBgPendingFile(null);
        setBgImagePreview(null);
        if (meta?.backgroundType === 'image') {
          const { backgroundUrl } = useMoodStore.getState();
          if (backgroundUrl) setBgImagePreview(backgroundUrl);
        }
      }
    } else {
      // Reset for new mood
      setTitle('New Mood');
      setDescription('');
      setPaletteOverrides({});
      setPersona({
        name: 'The Keeper',
        description: 'Your creative companion',
        systemPrompt: '',
        greeting: 'What would you like to create today?',
      });
      setBgType('bloom');
      setTags([]);
      setBgPendingFile(null);
      setBgImagePreview(null);
    }
    setTab('palette');
  }, [open, moodId, moods]);

  const handleChangeColor = useCallback((key: keyof MoodPalette, value: string) => {
    setPaletteOverrides((prev) => ({ ...prev, [key]: value }));
    // Live preview on the actual app
    const cssVar = getVar(key);
    if (cssVar) document.documentElement.style.setProperty(cssVar, value);
  }, []);

  const handleChangePersona = useCallback((p: Partial<MoodPersona>) => {
    setPersona((prev) => ({ ...prev, ...p }));
  }, []);

  const generateBgPreview = useCallback(async (file: File, size: number) => {
    setBgGenerating(true);
    try {
      const url = await pixelateImageToDataURL(file, { blockSize: size });
      setBgImagePreview(url);
    } catch (err) {
      console.error('Background pixelation failed:', err);
    } finally {
      setBgGenerating(false);
    }
  }, []);

  const handleBgImageSelect = useCallback(async (file: File) => {
    setBgPendingFile(file);
    setBgBlockSize(8);
    setBgType('image');
    await generateBgPreview(file, 8);
  }, [generateBgPreview]);

  const handleBgBlockSizeChange = useCallback(async (size: number) => {
    setBgBlockSize(size);
    if (bgPendingFile) await generateBgPreview(bgPendingFile, size);
  }, [bgPendingFile, generateBgPreview]);

  const handleBgImageClear = useCallback(() => {
    setBgPendingFile(null);
    setBgImagePreview(null);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const meta: MoodMeta = {
        palette: Object.keys(paletteOverrides).length > 0 ? paletteOverrides : undefined,
        persona,
        backgroundType: bgType,
        tags: tags.length > 0 ? tags : undefined,
      };

      let targetMoodId: string;

      if (moodId) {
        await updateMood(moodId, meta);
        const services = (await import('@/services')).getServices();
        await services.crux.update(moodId, { title, description });
        targetMoodId = moodId;
      } else {
        const mood = await createMood(title);
        await updateMood(mood.id, meta);
        if (description) {
          const services = (await import('@/services')).getServices();
          await services.crux.update(mood.id, { description });
        }
        targetMoodId = mood.id;
      }

      // Save background image as mood artifact
      if (bgType === 'image' && bgImagePreview && bgPendingFile) {
        const services = (await import('@/services')).getServices();
        const res = await fetch(bgImagePreview);
        const blob = await res.blob();
        const file = new File([blob], 'background.png', { type: 'image/png' });
        await services.artifact.upload({
          resourceId: targetMoodId,
          blob: file,
          mimeType: 'image/png',
          meta: { path: 'background.png' },
        });
      }

      onClose();
    } catch (err) {
      console.error('Failed to save mood:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = useCallback(() => {
    // Revert live preview changes — re-apply active mood or defaults
    import('@/stores/moodStore').then(({ useMoodStore }) => {
      const { activeMood, applyMood } = useMoodStore.getState();
      applyMood(activeMood);
    });
    onClose();
  }, [onClose]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Left: Editor panel */}
      <div className="w-[420px] h-full flex flex-col bg-[#1a1a1a] border-r border-[#333] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-11 border-b border-[#333] bg-[#222] shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-sm font-medium text-white">
              {moodId ? 'Edit Mood' : 'New Mood'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 text-xs font-mono rounded-[var(--radius-sm)] bg-accent text-bg hover:opacity-90 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleClose}
              className="p-1 text-[#888] hover:text-white transition-colors cursor-pointer"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 h-9 border-b border-[#333]/50 shrink-0">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'px-2.5 py-1 text-xs font-mono rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                tab === id
                  ? 'bg-[#333] text-white'
                  : 'text-[#888] hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'palette' && (
            <PaletteTab
              draft={paletteOverrides}
              basePalette={basePalette}
              onChangeColor={handleChangeColor}
              activeSection={activeSection}
              onActiveSection={setActiveSection}
            />
          )}
          {tab === 'persona' && (
            <PersonaTab persona={persona} onChange={handleChangePersona} />
          )}
          {tab === 'background' && (
            <BackgroundTab
              bgType={bgType}
              onChangeBgType={setBgType}
              bgImagePreview={bgImagePreview}
              bgBlockSize={bgBlockSize}
              onBgImageSelect={handleBgImageSelect}
              onBgBlockSizeChange={handleBgBlockSizeChange}
              onBgImageClear={handleBgImageClear}
              bgGenerating={bgGenerating}
            />
          )}
          {tab === 'details' && (
            <DetailsTab
              title={title}
              description={description}
              tags={tags}
              onChangeTitle={setTitle}
              onChangeDescription={setDescription}
              onChangeTags={setTags}
            />
          )}
        </div>
      </div>

      {/* Right: Transparent — shows actual app with live changes */}
      <div className="flex-1" onClick={handleClose} />
    </div>
  );
}
