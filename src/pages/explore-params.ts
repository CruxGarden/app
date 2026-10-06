/**
 * The Explore page keeps its filters in the URL so every search is a link.
 * Anything can arrive in a query string; this is the one place that turns it
 * into values the API accepts (an unknown sort used to become a 400 and a
 * blank page).
 */

import type { ExploreSort } from '@/api/public';

export const EXPLORE_SORTS: readonly ExploreSort[] = ['relevant', 'recent', 'newest', 'alpha'];
export const EXPLORE_KINDS: readonly string[] = [
  '',
  'webapp',
  'page',
  'notes',
  'document',
  'image',
  'mood',
  'tool',
];

/** What Explore looks through: everything, or one of the four things people share. */
export type ExploreView = 'all' | 'cruxes' | 'people' | 'tools' | 'moods';
export const EXPLORE_VIEWS: readonly ExploreView[] = ['all', 'cruxes', 'people', 'tools', 'moods'];
/** @deprecated the URL's `type=authors` still opens People. */
export type ExploreResultType = ExploreView;

export function parseExploreView(value: string | null): ExploreView {
  if (value === 'authors') return 'people';
  return value && (EXPLORE_VIEWS as readonly string[]).includes(value)
    ? (value as ExploreView)
    : 'all';
}

export interface ParsedExploreParams {
  q: string;
  type: ExploreView;
  /** Undefined when absent or invalid — Explore picks its default from `q`. */
  sort: ExploreSort | undefined;
  kind: string;
  tags: string[];
  author: string;
  page: number;
}

export function parseExploreSort(value: string | null): ExploreSort | undefined {
  return value && (EXPLORE_SORTS as readonly string[]).includes(value)
    ? (value as ExploreSort)
    : undefined;
}

export function parseExploreKind(value: string | null): string {
  return value && EXPLORE_KINDS.includes(value) ? value : '';
}

/** A positive integer page, else 1 ("-3", "2.5", "abc" all clamp). */
export function parseExplorePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value.trim())) return 1;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

export function parseExploreParams(params: URLSearchParams): ParsedExploreParams {
  return {
    q: params.get('q') ?? '',
    type: parseExploreView(params.get('type')),
    sort: parseExploreSort(params.get('sort')),
    kind: parseExploreKind(params.get('kind')),
    tags: params.getAll('tag').filter(Boolean),
    author: params.get('author') ?? '',
    page: parseExplorePage(params.get('page')),
  };
}
