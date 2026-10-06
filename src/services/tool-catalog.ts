/**
 * What the live catalog on crux.garden offers (CR07). Add Crux used to send
 * every uninstalled tool to Explore, even when Explore had nothing to install;
 * these helpers decide what to say instead, kept free of React for tests.
 */
import type { ExploreCrux } from '@/api/public';

/** null while unknown; 'offline' when crux.garden could not be reached. */
export type ToolCatalog =
  | { state: 'loading' }
  | { state: 'offline' }
  | { state: 'ready'; byTemplate: Record<string, ExploreCrux> };

/** Index published tools by the tool id they declare (`meta.template`). */
export function catalogFromExplore(items: unknown[]): ToolCatalog {
  const byTemplate: Record<string, ExploreCrux> = {};
  for (const item of items) {
    const crux = item as ExploreCrux;
    if (crux?.kind !== 'tool') continue;
    const template = crux.meta?.template;
    if (typeof template === 'string' && !byTemplate[template]) byTemplate[template] = crux;
  }
  return { state: 'ready', byTemplate };
}

export type ToolAvailability = 'checking' | 'in-catalog' | 'coming-soon' | 'offline';

export function toolAvailability(catalog: ToolCatalog, toolId: string): ToolAvailability {
  if (catalog.state === 'loading') return 'checking';
  if (catalog.state === 'offline') return 'offline';
  return catalog.byTemplate[toolId] ? 'in-catalog' : 'coming-soon';
}

/** The sentence under an uninstalled tool, and whether Explore is worth offering. */
export function uninstalledToolCopy(
  label: string,
  availability: ToolAvailability,
): { message: string; offerExplore: boolean } {
  switch (availability) {
    case 'in-catalog':
      return {
        message: `${label} is not installed. Install it from Explore, or from its .cruxtool package, to create from it.`,
        offerExplore: true,
      };
    case 'checking':
      return { message: `Checking crux.garden for ${label}…`, offerExplore: false };
    case 'offline':
      return {
        message: `${label} is not installed, and crux.garden could not be reached to look for it. Import its .cruxtool package, or try again when you are online.`,
        offerExplore: false,
      };
    case 'coming-soon':
      return {
        message: `${label} is coming soon — it is not available to install yet. If someone sent you its .cruxtool package, import it here.`,
        offerExplore: false,
      };
  }
}

/** The honest empty state for a Tools or Moods tab with nothing published. */
export function emptyCatalogCopy(view: 'tools' | 'moods'): { title: string; body: string } {
  return view === 'tools'
    ? {
        title: 'No community Tools yet',
        body: 'Tools you make and share appear here.',
      }
    : {
        title: 'No community Moods yet',
        body: 'Moods you save and share appear here.',
      };
}
