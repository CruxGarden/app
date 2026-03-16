import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — exposes a type-safe IPC bridge to the renderer.
 * The renderer detects `window.electronAPI` to know it's running in Electron
 * and uses this bridge instead of the WASM/OPFS SQLite worker.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  sqlite: {
    run: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('sqlite:run', sql, params),
    get: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('sqlite:get', sql, params),
    all: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('sqlite:all', sql, params),
    export: () => ipcRenderer.invoke('sqlite:export'),
    import: (data: ArrayBuffer) => ipcRenderer.invoke('sqlite:import', data),
    close: () => ipcRenderer.invoke('sqlite:close'),

    // Blob storage
    blobWrite: (fingerprint: string, data: Uint8Array) =>
      ipcRenderer.invoke('sqlite:blob-write', fingerprint, data),
    blobRead: (fingerprint: string) =>
      ipcRenderer.invoke('sqlite:blob-read', fingerprint),
    blobDelete: (fingerprint: string) =>
      ipcRenderer.invoke('sqlite:blob-delete', fingerprint),
    blobExists: (fingerprint: string) =>
      ipcRenderer.invoke('sqlite:blob-exists', fingerprint),
    blobWipeAll: () => ipcRenderer.invoke('sqlite:blob-wipe-all'),
  },
});
