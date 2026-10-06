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
        Leave this off for a simpler workspace with helpful tips. Turn it on for code, data and
        connection controls. You can change it later in Settings → Getting started; it applies
        across this app.
      </p>
    </div>
  );
}
