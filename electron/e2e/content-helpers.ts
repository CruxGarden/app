import type { Page } from '@playwright/test';

/** A Crux's (or snapshot's) current files as the API holds them: path → fingerprint. */
export const indexedFiles = (page: Page, cruxId: string) =>
  page.evaluate(async (id) => {
    const content = window.electronAPI!.sqlite.fileContent!;
    const head = await content.head(id);
    if (!head) return {} as Record<string, string>;
    const listed = await content.list({ cruxId: id, expected: head }).catch(() => null);
    if (!listed) return {} as Record<string, string>;
    const { entries } = listed;
    return Object.fromEntries(entries.map((entry) => [entry.path, entry.fingerprint]));
  }, cruxId);

/** One file's text as the API holds it; null when there is no such file, undefined mid-write. */
export const fileText = (page: Page, cruxId: string, path: string) =>
  page.evaluate(
    async ({ id, path }) => {
      const content = window.electronAPI!.sqlite.fileContent!;
      const head = await content.head(id);
      if (!head) return null;
      // A write can land between reading the head and the file; the next poll sees it.
      const file = await content.read({ cruxId: id, expected: head, path }).catch(() => undefined);
      if (file === undefined) return undefined;
      return file ? new TextDecoder().decode(file.bytes) : null;
    },
    { id: cruxId, path },
  );
