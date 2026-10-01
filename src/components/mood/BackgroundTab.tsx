import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useState, useRef } from 'react';
import { type MoodTab } from '@/stores/uiStore';
import { cn } from '@/lib/cn';
import { BgType } from '@/lib/types';
import { getResolvedMode } from './mood-helpers';
import { Button, SectionLabel } from '@/components/ui';

/** The Mood pane's Background tab: bloom, drift, flow, blank or an image of your own. */
export function BackgroundTabContent({
  bgType,
  onChangeBgType,
  bgImagePreview,
  onBgImageSelect,
  onBgImageClear,
  onBgGenerate,
  bgGenerating,
  bgError,
}: {
  bgType: BgType;
  onChangeBgType: (t: BgType) => void;
  bgImagePreview: string | null;
  onBgImageSelect: (file: File) => void;
  onBgImageClear: () => void;
  /** Make a backdrop from a description (the same path the agent's set_background uses). */
  onBgGenerate: (prompt: string) => void;
  bgGenerating: boolean;
  bgError: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [bgPrompt, setBgPrompt] = useState('');
  const aiEnabled = useAiEnabled();
  const isLight = getResolvedMode() === 'Light';

  const animatedOptions: {
    value: BgType;
    label: string;
    description: string;
    darkOnly?: boolean;
  }[] = [
    { value: BgType.Bloom, label: 'Bloom', description: 'Animated gradient blobs' },
    { value: BgType.Drift, label: 'Drift', description: 'Floating particles', darkOnly: true },
    { value: BgType.Flow, label: 'Waves', description: 'Organic wave patterns', darkOnly: true },
    { value: BgType.Blank, label: 'Blank', description: 'Solid background color' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <SectionLabel as="div" tone="muted">
          Animated
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {animatedOptions.map(({ value, label, description, darkOnly }) => {
            const disabled = darkOnly && isLight;
            return (
              <button
                key={value}
                onClick={() => !disabled && onChangeBgType(value)}
                disabled={disabled}
                className={cn(
                  'flex flex-col gap-0.5 px-3 py-2.5 rounded-[var(--radius-sm)] border text-left transition-colors',
                  disabled
                    ? 'opacity-[var(--disabled-opacity)] cursor-not-allowed border-border'
                    : bgType === value
                      ? 'bg-surface text-text border-accent/30 cursor-pointer'
                      : 'bg-transparent border-border text-text-muted hover:border-accent/20 hover:text-text cursor-pointer',
                )}
              >
                <span className="text-xs font-mono font-medium">{label}</span>
                <span className="text-2xs text-subtle">{description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionLabel as="div" tone="muted">
          Image
        </SectionLabel>
        <button
          onClick={() => {
            onChangeBgType(BgType.Image);
            if (!bgImagePreview) fileRef.current?.click();
          }}
          className={cn(
            'flex flex-col gap-0.5 px-3 py-2.5 rounded-[var(--radius-sm)] border text-left transition-colors cursor-pointer',
            bgType === 'image'
              ? 'bg-surface text-text border-accent/30'
              : 'bg-transparent border-border text-text-muted hover:border-accent/20 hover:text-text',
          )}
        >
          <span className="text-xs font-mono font-medium">Image</span>
          <span className="text-2xs text-subtle">Upload a background image</span>
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

        {aiEnabled && (
          <form
            className="flex flex-col gap-1.5 mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (bgPrompt.trim() && !bgGenerating) onBgGenerate(bgPrompt.trim());
            }}
          >
            <SectionLabel as="label">Describe a backdrop</SectionLabel>
            <div className="flex gap-2">
              <input
                value={bgPrompt}
                onChange={(e) => setBgPrompt(e.target.value)}
                placeholder="fog over a pine forest at dawn, soft, muted"
                aria-label="Backdrop description"
                className="flex-1 h-8 rounded-input border border-input-border bg-input px-2.5 text-xs text-input-text placeholder:text-placeholder focus:outline-none focus:border-input-border-active focus:ring-1 focus:ring-input-outline"
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={!bgPrompt.trim() || bgGenerating}
                loading={bgGenerating}
              >
                Generate
              </Button>
            </div>
            <p className="text-2xs text-text-muted">
              Uses your image-capable model key (same as the agent). Or pick an image file below.
            </p>
            {bgError && (
              <p role="alert" data-testid="bg-error" className="text-2xs text-error">
                {bgError}
              </p>
            )}
          </form>
        )}
        {bgType === 'image' && bgImagePreview && (
          <div className="flex flex-col gap-2 mt-1 p-3 bg-bg border border-border/50 rounded-[var(--radius-sm)]">
            <div className="relative w-full h-28 rounded-[var(--radius-sm)] overflow-hidden">
              <img
                src={bgImagePreview}
                alt="Background preview"
                className="w-full h-full object-cover"
              />
              {bgGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-bg/60">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="text-2xs text-accent hover:text-accent/80 transition-colors cursor-pointer"
              >
                Change image
              </button>
              <button
                onClick={onBgImageClear}
                className="text-2xs text-error hover:text-error/80 transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
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

// ── Main Component ───────────────────────────────────

/**
 * A Mood is four things — Theme, Background, Sound, Persona — plus the
 * library of Moods to wear. Each tab edits the ACTIVE Mood live; "Save current
 * as Mood" under Moods captures it. It lives in the Mood pane; anything
 * that wants a particular section asks through `openMood(tab)`.
 */
export type Tab = MoodTab;
