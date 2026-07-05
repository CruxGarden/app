/**
 * Platform detection & Capabilities (see CONTEXT.md, DESKTOP-ASTRO-PLAN.md).
 *
 * Web Mode vs Desktop Mode is a platform difference, not a data-location
 * difference. UI and services gate on Capabilities — never on "is this
 * Electron" checks scattered through components. Today one platform implies
 * all desktop capabilities; if a capability ever changes sides (e.g. cloud
 * builds), it flips here and nowhere else.
 */

export enum Capability {
  /** Real Project Folder per crux on the local filesystem (ADR 0001). */
  ProjectFolder = 'projectFolder',
  /** External edits to Project Folders are watched and ingested. */
  ExternalEdit = 'externalEdit',
  /** Can run builds (pnpm/astro) for Site Cruxes (ADR 0004/0005). */
  Build = 'build',
  /** Local preview webserver serving from disk (ADR 0003). */
  PreviewServer = 'previewServer',
  /** OS-keychain-backed secret storage (safeStorage). */
  SecureSecrets = 'secureSecrets',
}

interface ElectronBridge {
  sqlite?: unknown;
  project?: unknown;
  secrets?: unknown;
  preview?: unknown;
  toolchain?: unknown;
  devserver?: unknown;
}

function bridge(): ElectronBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { electronAPI?: ElectronBridge }).electronAPI ?? null;
}

/** Desktop Mode = running inside the Electron shell. */
export function isDesktop(): boolean {
  return bridge() !== null;
}

/** Whether this platform provides the given capability. */
export function can(capability: Capability): boolean {
  const api = bridge();
  if (!api) return false;
  switch (capability) {
    case Capability.ProjectFolder:
    case Capability.ExternalEdit: // watcher + ingestion ride the project bridge
      return !!api.project;
    case Capability.SecureSecrets:
      return !!api.secrets;
    case Capability.PreviewServer:
      return !!api.preview;
    case Capability.Build:
      return !!api.toolchain && !!api.devserver;
  }
}
