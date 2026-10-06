import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { chooseGardenRoot, getGardenRoot, shortenHomePath } from '@/services/desktop';

/**
 * Where Project Folders live (the Garden Root), with Choose…. The choice is
 * the desktop shell's own setting and takes effect at once, as it always has
 * in setup and in Settings → Garden.
 */
export default function GardenFolderField({
  disabled,
  labelId,
}: {
  disabled?: boolean;
  /** The visible label this field answers to. */
  labelId?: string;
}) {
  const [root, setRoot] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getGardenRoot().then((value) => {
      if (live) setRoot(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <code
        aria-labelledby={labelId}
        className="flex-1 min-w-0 px-3 py-2 text-xs font-mono rounded-[var(--radius-sm)] bg-surface-solid border border-border text-text truncate"
        title={root ?? undefined}
      >
        {root ? shortenHomePath(root) : 'Loading…'}
      </code>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-label="Choose garden folder"
        onClick={async () => {
          const chosen = await chooseGardenRoot();
          if (chosen) setRoot(chosen);
        }}
      >
        Choose…
      </Button>
    </div>
  );
}
