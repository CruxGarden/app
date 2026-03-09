import type { ICruxService } from './crux.service';
import type { IAttachmentService } from './attachment.service';
import type { IDimensionService } from './dimension.service';
import type { IAuthorService } from './author.service';
import type { IPublishService } from './publish.service';
import { getSqliteClient } from './sqlite/client';
import { initSettings } from './settings';

export interface Services {
  crux: ICruxService;
  attachment: IAttachmentService;
  dimension: IDimensionService;
  author: IAuthorService;
  publish: IPublishService;
}

export type Backend = 'local' | 'api';

let services: Services | null = null;
let currentBackend: Backend | null = null;
let initPromise: Promise<Services> | null = null;

export async function getBackendSetting(): Promise<Backend> {
  try {
    const row = await getSqliteClient().get<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'cruxgarden:backend'",
    );
    return (row?.value as Backend) || 'local';
  } catch {
    return 'local';
  }
}

export function initServices(backend?: Backend): Promise<Services> {
  if (services) return Promise.resolve(services);
  if (initPromise) return initPromise;
  initPromise = doInitServices(backend).finally(() => { initPromise = null; });
  return initPromise;
}

async function doInitServices(backend?: Backend): Promise<Services> {
  const resolvedBackend = backend ?? (await getBackendSetting());

  if (resolvedBackend === 'api') {
    const { ApiCruxService } = await import('./api/crux.service');
    const { ApiAttachmentService } = await import('./api/attachment.service');
    const { ApiDimensionService } = await import('./api/dimension.service');
    const { ApiAuthorService } = await import('./api/author.service');
    const { ApiPublishService } = await import('./api/publish.service');

    services = {
      crux: new ApiCruxService(),
      attachment: new ApiAttachmentService(),
      dimension: new ApiDimensionService(),
      author: new ApiAuthorService(),
      publish: new ApiPublishService(),
    };
  } else {
    const { SqliteCruxService } = await import('./sqlite/crux.service');
    const { SqliteAttachmentService } = await import('./sqlite/attachment.service');
    const { SqliteDimensionService } = await import('./sqlite/dimension.service');
    const { SqliteAuthorService } = await import('./sqlite/author.service');
    const { ApiPublishService } = await import('./api/publish.service');

    services = {
      crux: new SqliteCruxService(),
      attachment: new SqliteAttachmentService(),
      dimension: new SqliteDimensionService(),
      author: new SqliteAuthorService(),
      publish: new ApiPublishService(), // always talks to API
    };
  }

  currentBackend = resolvedBackend;

  // Populate settings cache from SQLite + migrate localStorage values
  await initSettings();

  return services;
}

export function getServices(): Services {
  if (!services) {
    throw new Error(
      'Services not initialized. Call initServices() at app startup before using getServices().',
    );
  }
  return services;
}

export function getBackend(): Backend {
  if (!currentBackend) {
    throw new Error('Services not initialized.');
  }
  return currentBackend;
}

export function isServicesReady(): boolean {
  return services !== null;
}

/**
 * Ensure a local author exists (for local-first mode).
 * Returns the existing or newly created author.
 */
export async function ensureLocalAuthor(): Promise<import('./types').Author> {
  const db = getSqliteClient();
  const existing = await db.get<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'cruxgarden:localAuthorId'",
  );
  if (existing?.value) {
    try {
      return await services!.author.findById(existing.value);
    } catch {
      // Author was deleted — fall through to create a new one
    }
  }

  const shortId = crypto.randomUUID().slice(0, 8);
  const author = await services!.author.create({
    username: `wanderer-${shortId}`,
    displayName: 'Wanderer',
  });
  await db.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('cruxgarden:localAuthorId', ?)",
    [author.id],
  );
  return author;
}

// Re-export interfaces for convenience
export type { ICruxService } from './crux.service';
export type { IAttachmentService } from './attachment.service';
export type { IDimensionService } from './dimension.service';
export type { IAuthorService } from './author.service';
export type { IPublishService } from './publish.service';
