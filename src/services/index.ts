import type { ICruxService } from './crux.service';
import type { IArtifactService } from './artifact.service';
import type { IDimensionService } from './dimension.service';
import type { IAuthorService } from './author.service';
import type { IStoreService } from './sqlite/store.service';
import { getSqliteClient } from './sqlite/client';
import { initSettings } from './settings';
import { SettingsKey } from '@/lib/constants';
import { NotFoundError } from './types';

export interface Services {
  crux: ICruxService;
  artifact: IArtifactService;
  dimension: IDimensionService;
  author: IAuthorService;
  store: IStoreService;
}

let services: Services | null = null;
let initPromise: Promise<Services> | null = null;

export function initServices(): Promise<Services> {
  if (initPromise) return initPromise;
  if (services) return Promise.resolve(services);
  initPromise = doInitServices()
    .catch((error) => {
      services = null;
      throw error;
    })
    .finally(() => {
      initPromise = null;
    });
  return initPromise;
}

async function doInitServices(): Promise<Services> {
  const { SqliteStoreService } = await import('./sqlite/store.service');
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
    store: new SqliteStoreService(),
  };

  // Admit the actual local root before UI/tool consumers can initialize identity.
  const localEntry = getSqliteClient().enterLocalGarden;
  if (localEntry) {
    const root = await localEntry();
    const { useGardenContext } = await import('@/stores/gardenContext');
    useGardenContext.getState().initialize(root);
  }

  // Populate settings cache from SQLite + migrate localStorage values
  await initSettings();

  // Desktop (ADR 0001): external Project Folder edits are recorded whenever
  // the store is live, so ingestion rides the services lifecycle. No-op on web.
  const { initIngestion, recoverProjectFolders } = await import('./ingestion');
  await (await import('./file-content')).finishPendingContentProjections();
  initIngestion();
  await recoverProjectFolders();
  if (getSqliteClient().onChange) {
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
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      // Author was deleted — fall through to create a new one
    }
  }

  const shortId = crypto.randomUUID().slice(0, 8);
  const input = { username: `wanderer-${shortId}`, displayName: 'Wanderer' };
  // The native command records the author and installation identity atomically.
  const { SqliteAuthorService } = await import('./sqlite/author.service');
  const created = await new SqliteAuthorService().create({ ...input, local: true });
  (await import('./settings')).setSetting(SettingsKey.LocalAuthorId, created.id);
  return created;
}

// Re-export interfaces for convenience
export type { ICruxService } from './crux.service';
export type { IArtifactService } from './artifact.service';
export type { IDimensionService } from './dimension.service';
export type { IAuthorService } from './author.service';
export type { IStoreService } from './sqlite/store.service';
