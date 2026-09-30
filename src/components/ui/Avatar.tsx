import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * A person's face: their picture, or their initial on a tinted square. Sites
 * pass their own tint (`fallbackClassName`) so the same square reads as a
 * chat bubble, a profile button or a card.
 */
export default function Avatar({
  url,
  initial,
  size = 'sm',
  className,
  fallbackClassName = 'bg-accent-muted text-accent',
  alt = '',
}: {
  url?: string | null;
  initial?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fallbackClassName?: string;
  alt?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const visibleUrl = url && url !== failedUrl ? url : null;
  const dim = size === 'lg' ? 'w-12 h-12' : size === 'md' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <div
      className={cn(
        dim,
        'shrink-0 rounded-[var(--radius-sm)] overflow-hidden flex items-center justify-center',
        !visibleUrl && 'text-2xs font-body font-bold',
        !visibleUrl && fallbackClassName,
        className,
      )}
    >
      {visibleUrl ? (
        <img
          src={visibleUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(visibleUrl)}
          className="w-full h-full object-cover"
        />
      ) : (
        initial
      )}
    </div>
  );
}
