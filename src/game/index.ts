/**
 * `src/game/` — the interrogable-crux primitive and 5Ws on top of
 * it (ADR 0016). Pure: no React, no stores, no services. The Round surface
 * (W2) and the `5ws` template's Builder actions (W1) import from
 * here.
 */

export * from './hidden';
export * from './shelf';
export * from './round';
export * from './prompts';
export * from './transcript';
export * from './leaks';
