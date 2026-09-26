import type { ICruxService } from './crux.service';
import type { IArtifactService } from './artifact.service';
import type { IDimensionService } from './dimension.service';
import type { IAuthorService } from './author.service';
import type { IStoreService } from './sqlite/store.service';
import { getSqliteClient } from './sqlite/client';
import { initSettings } from './settings';
import { SettingsKey } from '@/lib/constants';

export interface Services {
  crux: ICruxService;
  artifact: IArtifactService;
  dimension: IDimensionService;
  author: IAuthorService;
  store: IStoreService;
}

export type Backend = 'local' | 'api';

let services: Services | null = null;
let currentBackend: Backend | null = null;
let initPromise: Promise<Services> | null = null;

export async function getBackendSetting(): Promise<Backend> {
  try {
    const row = await getSqliteClient().get<{ value: string }>(
      `SELECT value FROM settings WHERE key = '${SettingsKey.Backend}'`,
    );
    return (row?.value as Backend) || 'local';
  } catch {
    return 'local';
  }
}

export function initServices(backend?: Backend): Promise<Services> {
  if (initPromise) return initPromise;
  if (services) return Promise.resolve(services);
  initPromise = doInitServices(backend)
    .catch((error) => {
      services = null;
      currentBackend = null;
      throw error;
    })
    .finally(() => {
      initPromise = null;
    });
  return initPromise;
}

async function doInitServices(backend?: Backend): Promise<Services> {
  const resolvedBackend = backend ?? (await getBackendSetting());

  // Store service is always local SQLite (even in API backend mode — store is local-first)
  const { SqliteStoreService } = await import('./sqlite/store.service');
  const storeService = new SqliteStoreService();

  if (resolvedBackend === 'api') {
    const { ApiCruxService } = await import('./api/crux.service');
    const { ApiArtifactService } = await import('./api/artifact.service');
    const { ApiDimensionService } = await import('./api/dimension.service');
    const { ApiAuthorService } = await import('./api/author.service');
    services = {
      crux: new ApiCruxService(),
      artifact: new ApiArtifactService(),
      dimension: new ApiDimensionService(),
      author: new ApiAuthorService(),
      store: storeService,
    };
  } else {
    const { SqliteCruxService } = await import('./sqlite/crux.service');
    const { SqliteArtifactService } = await import('./sqlite/artifact.service');
    const { ManifestArtifactService } = await import('./manifest-artifact.service');
    const { SqliteDimensionService } = await import('./sqlite/dimension.service');
    const { SqliteAuthorService } = await import('./sqlite/author.service');
    services = {
      crux: new SqliteCruxService(),
      artifact: getSqliteClient().fileContent
        ? new ManifestArtifactService()
        : new SqliteArtifactService(),
      dimension: new SqliteDimensionService(),
      author: new SqliteAuthorService(),
      store: storeService,
    };
  }

  currentBackend = resolvedBackend;

  // Admit the actual local root before UI/tool consumers can initialize identity.
  const localEntry = getSqliteClient().enterLocalGarden;
  if (resolvedBackend === 'local' && localEntry) {
    const root = await localEntry();
    const { useGardenContext } = await import('@/stores/gardenContext');
    useGardenContext.getState().initialize(root);
  }

  // Populate settings cache from SQLite + migrate localStorage values
  await initSettings();

  // Desktop (ADR 0001): external Project Folder edits must be recorded
  // whenever the store is live — ingestion rides the services lifecycle.
  // This used to live only in appStore.init(), which the Gateway's own entry
  // path never calls (it calls initServices() directly), so entering through
  // the front door left the watcher firing at a renderer with no listener
  // and Finder edits never appeared in the Artifacts pane. No-op on web.
  const { initIngestion, recoverProjectFolders } = await import('./ingestion');
  await (await import('./file-content')).finishPendingContentProjections();
  initIngestion();
  await recoverProjectFolders();
  if (resolvedBackend === 'local' && getSqliteClient().onChange) {
    const { initGraphChanges } = await import('./graph-changes');
    initGraphChanges();
  }
  if (getSqliteClient().gardenMood) {
    // The active Garden's Mood paints the app (ADR 0058, Garden Mood association).
    const { startGardenMoodProjection } = await import('./garden-mood');
    startGardenMoodProjection();
  }

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
    `SELECT value FROM settings WHERE key = '${SettingsKey.LocalAuthorId}'`,
  );
  if (existing?.value) {
    try {
      return await services!.author.findById(existing.value);
    } catch {
      // Author was deleted — fall through to create a new one
    }
  }

  const shortId = crypto.randomUUID().slice(0, 8);
  const input = { username: `wanderer-${shortId}`, displayName: 'Wanderer' };
  // Desktop: the author and the installation's record of it land together.
  if (db.installation) {
    const { SqliteAuthorService } = await import('./sqlite/author.service');
    const created = await new SqliteAuthorService().create({ ...input, local: true });
    // The command recorded it in the database; keep the settings cache in step.
    (await import('./settings')).setSetting(SettingsKey.LocalAuthorId, created.id);
    return created;
  }
  const author = await services!.author.create(input);
  await db.run(
    `INSERT OR REPLACE INTO settings (key, value) VALUES ('${SettingsKey.LocalAuthorId}', ?)`,
    [author.id],
  );
  return author;
}

// Re-export interfaces for convenience
export type { ICruxService } from './crux.service';
export type { IArtifactService } from './artifact.service';
export type { IDimensionService } from './dimension.service';
export type { IAuthorService } from './author.service';
export type { IStoreService } from './sqlite/store.service';
