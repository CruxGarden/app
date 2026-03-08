import type { ICruxService } from './crux.service';
import type { IAttachmentService } from './attachment.service';
import type { IDimensionService } from './dimension.service';
import type { IAuthorService } from './author.service';
import type { IPublishService } from './publish.service';
import { db } from './dexie/schema';

export interface Services {
  crux: ICruxService;
  attachment: IAttachmentService;
  dimension: IDimensionService;
  author: IAuthorService;
  publish: IPublishService;
}

export type Backend = 'dexie' | 'api';

let services: Services | null = null;
let currentBackend: Backend | null = null;

export async function getBackendSetting(): Promise<Backend> {
  try {
    const row = await db.settings.get('backend');
    return (row?.value as Backend) || 'dexie';
  } catch {
    return 'dexie';
  }
}

export async function initServices(backend?: Backend): Promise<Services> {
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
    const { DexieCruxService } = await import('./dexie/crux.service');
    const { DexieAttachmentService } = await import('./dexie/attachment.service');
    const { DexieDimensionService } = await import('./dexie/dimension.service');
    const { DexieAuthorService } = await import('./dexie/author.service');
    const { ApiPublishService } = await import('./api/publish.service');

    services = {
      crux: new DexieCruxService(),
      attachment: new DexieAttachmentService(),
      dimension: new DexieDimensionService(),
      author: new DexieAuthorService(),
      publish: new ApiPublishService(), // always talks to API
    };
  }

  currentBackend = resolvedBackend;
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

// Re-export interfaces for convenience
export type { ICruxService } from './crux.service';
export type { IAttachmentService } from './attachment.service';
export type { IDimensionService } from './dimension.service';
export type { IAuthorService } from './author.service';
export type { IPublishService } from './publish.service';
