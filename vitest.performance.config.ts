import { defineConfig } from 'vitest/config';
import base from './vite.config';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['performance/*.perf.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20 * 60_000,
  },
});
