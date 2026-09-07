import { cn } from '@/lib/cn';
import defaultAvatar from '@/assets/moods/keeper/keeper-avatar.png?url';

/**
 * The persona's face. Avatars are transparent PNGs (The Keeper's is), so the
 * space behind them is a gradient drawn from the active theme — surface into
 * accent — and the face sits in the room whatever Mood is on. A user's own
 * avatar (any image) gets the same treatment; opaque ones simply cover it.
 */
export const PERSONA_AVATAR_GRADIENT =
  'linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--accent) 38%, var(--bg)) 100%)';

export default function PersonaAvatar({
  src,
  className = 'w-6 h-6',
  bordered = false,
  alt = '',
  title,
}: {
  /** Resolved image URL; the bundled Keeper when absent */
  src?: string | null;
  className?: string;
  bordered?: boolean;
  alt?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        className,
        'inline-block shrink-0 aspect-square overflow-hidden rounded-[var(--radius-sm)]',
        bordered && 'ring-1 ring-border',
      )}
      style={{ background: PERSONA_AVATAR_GRADIENT }}
      title={title}
      data-testid="persona-avatar"
    >
      <img src={src || defaultAvatar} alt={alt} className="w-full h-full object-cover block" />
    </span>
  );
}

export { defaultAvatar as DEFAULT_PERSONA_AVATAR };
