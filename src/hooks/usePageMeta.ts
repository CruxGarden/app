import { useEffect } from 'react';
import { applyPageMeta, type MetaDocument, type PageMeta } from '@/lib/page-meta';
import { gardenOrigin } from '@/lib/public-url';

/** The public address of a path on the website, for canonical and og:url. */
export function canonicalUrl(path: string): string {
  return `${gardenOrigin()}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Set this page's head tags while it is mounted and put the site defaults back
 * when it leaves. Pass `null` while the page has nothing to say yet (loading).
 */
export function usePageMeta(page: PageMeta | null): void {
  const { title, description, canonical, image } = page ?? {};
  useEffect(() => {
    if (!title) return;
    return applyPageMeta(document as unknown as MetaDocument, {
      title,
      description,
      canonical,
      image,
    });
  }, [title, description, canonical, image]);
}
