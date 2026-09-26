import { useState, useRef } from 'react';
import { SectionLabel } from '@/components/ui';
import { cn } from '@/lib/cn';
import PersonaAvatar from '@/components/persona/PersonaAvatar';
import { getPersona, savePersona, DEFAULT_PERSONA, type PersonaSettings } from './mood-helpers';
import { useBlobUrl } from '@/hooks/useBlobUrl';

/** The Mood pane's Persona tab: who the collaborator is — name, greeting, prompt, faces. */
// ── Persona Tab ──────────────────────────────────────

export function PersonaTab() {
  const [persona, setPersona] = useState<PersonaSettings>(() => getPersona());
  const fileRef = useRef<HTMLInputElement>(null);
  const darkThumbUrl = useBlobUrl(persona.thumbnailFingerprint);

  const update = (patch: Partial<PersonaSettings>) => {
    const next = { ...persona, ...patch };
    setPersona(next);
    savePersona(next);
  };

  // One avatar for the persona, whatever the mode: it sits on a theme gradient
  // (PersonaAvatar), so it never needs a dark and a light copy.
  const handleThumbnailUpload =
    (field: 'thumbnailFingerprint') => async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) return;

      // Resize to 128x128 square
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d')!;
            const size = Math.min(img.width, img.height);
            const sx = (img.width - size) / 2;
            const sy = (img.height - size) / 2;
            ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
            resolve(canvas.toDataURL('image/webp', 0.8));
          };
          img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
      });

      // Write to OPFS blob store
      const res = await fetch(dataUrl);
      const buffer = new Uint8Array(await res.arrayBuffer());
      const { putBlob } = await import('@/services/blobs');
      const fp = await putBlob(buffer);

      // One avatar: the light-mode copy is retired along with the legacy data URLs
      update({
        [field]: fp,
        thumbnailDataUrl: null,
        thumbnailFingerprintLight: null,
        thumbnailDataUrlLight: null,
      });
      e.target.value = '';
    };

  const handleReset = () => {
    const fresh = { ...DEFAULT_PERSONA };
    setPersona(fresh);
    savePersona(fresh);
  };

  const isCustomized =
    persona.name !== DEFAULT_PERSONA.name ||
    persona.greeting !== DEFAULT_PERSONA.greeting ||
    persona.systemPrompt !== DEFAULT_PERSONA.systemPrompt ||
    !!persona.thumbnailFingerprint;

  const inputClass = cn(
    'w-full bg-bg border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5',
    'text-xs text-text placeholder:text-text-muted/50',
    'focus:outline-none focus:border-input-border-active font-mono',
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Thumbnails */}
      <div className="shrink-0">
        <SectionLabel as="div" tone="muted" className="mb-2">
          Avatar
        </SectionLabel>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-16 h-16 shrink-0 rounded-[var(--radius)] border border-border overflow-hidden bg-surface hover:border-accent cursor-pointer"
              aria-label="Choose an avatar"
            >
              <PersonaAvatar src={darkThumbUrl} className="w-full h-full rounded-none" />
            </button>
            {persona.thumbnailFingerprint && (
              <button
                onClick={() =>
                  update({
                    thumbnailFingerprint: null,
                    thumbnailDataUrl: null,
                    thumbnailFingerprintLight: null,
                    thumbnailDataUrlLight: null,
                  })
                }
                className="text-3xs text-error hover:text-text cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleThumbnailUpload('thumbnailFingerprint')}
          />
        </div>
      </div>

      {/* Name */}
      <div className="shrink-0">
        <SectionLabel as="div" tone="muted" className="mb-1.5">
          Name
        </SectionLabel>
        <input
          type="text"
          value={persona.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Persona name"
          className={inputClass}
          maxLength={50}
        />
      </div>

      {/* Greeting */}
      <div className="shrink-0">
        <SectionLabel as="div" tone="muted" className="mb-1.5">
          Greeting
        </SectionLabel>
        <input
          type="text"
          value={persona.greeting}
          onChange={(e) => update({ greeting: e.target.value })}
          placeholder="A greeting shown when the console opens"
          className={inputClass}
          maxLength={200}
        />
      </div>

      {/* System Prompt */}
      <div className="flex-1 min-h-0 flex flex-col">
        <SectionLabel as="div" tone="muted" className="mb-1.5 shrink-0">
          System Prompt
        </SectionLabel>
        <textarea
          value={persona.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder="Custom instructions for the AI persona..."
          className={cn(inputClass, 'resize-none flex-1 min-h-[80px]')}
          maxLength={4000}
        />
        <div className="flex items-center justify-between mt-1 shrink-0">
          <p className="text-3xs text-text-muted/50">
            {persona.systemPrompt ? `${persona.systemPrompt.length}/4000` : ''}
          </p>
          {isCustomized && (
            <button
              onClick={handleReset}
              className="text-2xs font-mono text-text-muted hover:text-error cursor-pointer"
            >
              Revert to Default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Background ──────────────────────────────────
