import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's stock scale. Without this it reads the
 * app's small sizes (`text-3xs`, `text-2xs`, `text-xxs`) as text *colours* and
 * drops them whenever a colour class follows — so `cn('text-xxs', 'text-accent')`
 * silently lost the size and the element fell back to 16px.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['3xs', '2xs', 'xxs'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
