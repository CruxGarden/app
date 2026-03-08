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
