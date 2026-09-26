import { describe, it, expect } from 'vitest';
import { initServices, getServices } from './index';

describe('Service Factory', () => {
  it('initializes the local services', async () => {
    const services = await initServices();
    expect(services.crux).toBeDefined();
    expect(services.artifact).toBeDefined();
    expect(services.dimension).toBeDefined();
    expect(services.author).toBeDefined();
  });

  it('makes services available via getServices() and initializes exactly once', async () => {
    const first = await initServices();
    expect(getServices()).toBe(first);
    expect(await initServices()).toBe(first);
  });
});
