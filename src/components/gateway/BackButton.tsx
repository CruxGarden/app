import { cn } from '@/lib/cn';
import { ArrowLeftIcon } from '@/components/ui/icons';

/** The quiet way back a step on the Gateway. */
export default function BackButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 text-xs text-text-muted hover:text-text mb-4 cursor-pointer',
        'disabled:cursor-not-allowed',
      )}
    >
      <ArrowLeftIcon />
      Back
    </button>
  );
}
