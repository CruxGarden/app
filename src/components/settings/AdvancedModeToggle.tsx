import { useId } from 'react';
import { Toggle } from '@/components/ui';

/** Used with saved settings or the wizard's uncommitted choices. */
export default function AdvancedModeToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const description = useId();
  return (
    <div className="space-y-2" data-testid="advanced-mode-choice">
      <Toggle
        label="Advanced Mode"
        checked={checked}
        onChange={onChange}
        describedBy={description}
      />
      <p id={description} className="text-xs text-text-muted">
        Show code, data and connection controls, with less step-by-step guidance. Applies throughout
        this installation. Change it any time in Settings → Getting started. Existing work and open
        editors stay as they are.
      </p>
    </div>
  );
}
