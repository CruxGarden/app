/// <reference types="vite/client" />

declare module '*.sql?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_PREVIEW_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:crux-tools' {
  /** Template ids whose files are in this build (vite-plugin-crux-tools.ts). */
  export const bundled: string[];
  export const loaders: Record<
    string,
    () => Promise<{ default: import('./src/templates/index').ToolTemplateFiles }>
  >;
}
