import type { ReactNode } from 'react';

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
/** How ⌘K is written on this machine. */
export const COMMAND_SHORTCUT = isMac ? '⌘K' : 'Ctrl K';

export type Section = 'Go to' | 'Actions' | 'Panels' | 'Moods' | 'Settings';
/** The palette's sections, in the order they are listed. */
export const SECTIONS: Section[] = ['Go to', 'Actions', 'Panels', 'Moods', 'Settings'];

export interface Command {
  id: string;
  section: Section;
  label: string;
  /** Right-aligned: where a result lives, or its shortcut. */
  hint?: string;
  /** More words it answers to. */
  keywords?: string;
  icon?: ReactNode;
  /** Shown only once something is typed (long lists, like every Mood). */
  queryOnly?: boolean;
  run: () => void | Promise<void>;
}

/** Every word typed must land somewhere; earlier and whole-word landings rank higher. */
export function score(command: Command, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return command.queryOnly ? 0 : 1;
  const label = command.label.toLowerCase();
  const parts = label.split(/[\s·—›/-]+/);
  const extra = `${command.hint ?? ''} ${command.keywords ?? ''}`.toLowerCase();
  let total = 0;
  for (const word of words) {
    if (label.startsWith(word)) total += 4;
    else if (parts.some((part) => part.startsWith(word))) total += 3;
    else if (label.includes(word)) total += 2;
    else if (extra.includes(word)) total += 1;
    else return 0;
  }
  return total;
}
