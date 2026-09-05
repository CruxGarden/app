/**
 * Type-check shim, never written into a crux. In the published site,
 * `src/game/` holds a verbatim copy of the app's `src/game/*.ts` (written by
 * the 5Ws template via `?raw`); here the island's relative imports resolve to
 * the one real engine so `tsc`, eslint and vitest see the same code the site
 * will run.
 */
export * from '../../../../game/hidden';
export * from '../../../../game/shelf';
export * from '../../../../game/round';
export * from '../../../../game/prompts';
export * from '../../../../game/transcript';
export * from '../../../../game/leaks';
