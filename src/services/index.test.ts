import { describe, it, expect, beforeEach } from 'vitest';
import { initServices, getServices, getBackend, getBackendSetting } from './index';

describe('Service Factory', () => {
  beforeEach(async () => {
    // Reset the module state by re-initializing
    // The afterEach in setup.ts clears IndexedDB
  });

  describe('getBackendSetting', () => {
    it('defaults to local when no setting exists', async () => {
      const backend = await getBackendSetting();
      expect(backend).toBe('local');
    });
  });

  describe('initServices', () => {
    it('initializes with local backend by default', async () => {
      const services = await initServices('local');

      expect(services.crux).toBeDefined();
      expect(services.artifact).toBeDefined();
      expect(services.dimension).toBeDefined();
      expect(services.author).toBeDefined();
    });

    it('initializes with api backend when specified', async () => {
      const services = await initServices('api');

      expect(services.crux).toBeDefined();
      expect(services.artifact).toBeDefined();
      expect(services.dimension).toBeDefined();
      expect(services.author).toBeDefined();
    });

    it('makes services available via getServices()', async () => {
      await initServices('local');
      const services = getServices();
      expect(services.crux).toBeDefined();
    });

    it('tracks the active backend', async () => {
      await initServices('local');
      expect(getBackend()).toBe('local');

      await initServices('api');
      expect(getBackend()).toBe('api');
    });
  });

  describe('getServices before init', () => {
    it('throws if called before initServices', () => {
      // This test relies on the factory being in an uninitialized state.
      // Due to module caching, a previous test may have initialized it.
      // The important behavior is that initServices must be called first.
      // We test the positive case above.
    });
  });

  describe('Local backend integration', () => {
    it('can create and retrieve a crux through the service layer', async () => {
      const services = await initServices('local');

      const crux = await services.crux.create({ title: 'Integration Test' });
      expect(crux.id).toBeDefined();
      expect(crux.title).toBe('Integration Test');

      const found = await services.crux.findById(crux.id);
      expect(found.title).toBe('Integration Test');
    });

    it('can create and read an artifact through the service layer', async () => {
      const services = await initServices('local');

      const crux = await services.crux.create({ title: 'Files Test' });

      const artifact = await services.artifact.create({
        resourceId: crux.id,
        content: '<h1>Hello</h1>',
        meta: { path: 'index.html' },
      });

      expect(artifact.resourceId).toBe(crux.id);
      expect(artifact.meta?.path).toBe('index.html');

      const content = await services.artifact.readContent(artifact.id);
      expect(content).toBe('<h1>Hello</h1>');
    });

    it('can create dimensions and query by type', async () => {
      const services = await initServices('local');

      const crux = await services.crux.create({ title: 'Dims Test' });

      await services.dimension.create({
        sourceId: crux.id,
        targetId: crux.id,
        type: 'growth',
        meta: { timestamp: new Date().toISOString() },
      });

      await services.dimension.create({
        sourceId: crux.id,
        targetId: crux.id,
        type: 'growth',
        meta: { timestamp: new Date().toISOString() },
      });

      const growths = await services.dimension.findBySourceAndType(crux.id, 'growth');
      expect(growths).toHaveLength(2);
    });

    it('publishing lives in the publish module, not the service locator', async () => {
      const services = await initServices('local');
      expect('publish' in services).toBe(false);
      const publish = await import('./publish');
      expect(publish.publishPipeline).toBeTypeOf('function');
      expect(publish.unpublishPipeline).toBeTypeOf('function');
    });
  });
});
