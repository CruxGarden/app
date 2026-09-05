/**
 * Platform detection & Capabilities (see CONTEXT.md, DESKTOP-ASTRO-PLAN.md).
 *
 * Web Mode vs Desktop Mode is a platform difference, not a data-location
 * difference. UI and services gate on Capabilities — never on "is this
 * Electron" checks scattered through components. Today one platform implies
 * all desktop capabilities; if a capability ever changes sides (e.g. cloud
 * builds), it flips here and nowhere else.
 *
 * The bridge contract itself lives in electron/src/bridge.ts and is shared by
 * the preload implementation and every renderer consumer via the re-exports
 * below — there is exactly one declaration of what Desktop Mode provides.
 */

import type { ElectronBridge } from '../../electron/src/bridge';

export type {
  ElectronBridge,
  SqliteBridge,
  DesktopBridge,
  ProjectBridge,
  PreviewBridge,
  ToolchainBridge,
  DevServerBridge,
  SecretsBridge,
  FfmpegBridge,
  ChangeBatch,
  WatchEvent,
  TranscodeOutput,
  LocalAiBridge,
  LocalAiEndpoint,
  DesktopInfo,
  UpdateState,
  UpdateStatus,
  AgentHostBridge,
  AgentHostServer,
  AgentHostRequest,
  AgentHostResponse,
  AgentToolDefinition,
} from '../../electron/src/bridge';

declare global {
  interface Window {
    electronAPI?: ElectronBridge;
  }
}

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
  /** ffmpeg media transcoding in the main process. */
  Transcode = 'transcode',
  /** Frameless-window chrome: drag regions, traffic-light insets. */
  DesktopChrome = 'desktopChrome',
  /** Local inference (Ollama / LM Studio) detection + CORS shim. */
  LocalInference = 'localInference',
  /** Self-update via electron-updater → GitHub Releases (ADR 0007). */
  Updates = 'updates',
  /** Hosts an MCP server per crux for external agents (ADR 0013). Desktop Mode only. */
  AgentHost = 'agentHost',
}

function bridge(): Partial<ElectronBridge> | null {
  if (typeof window === 'undefined') return null;
  return window.electronAPI ?? null;
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
    case Capability.Transcode:
      return !!api.ffmpeg;
    case Capability.DesktopChrome:
      return !!api.desktop;
    case Capability.LocalInference:
      return !!api.localai;
    case Capability.Updates:
      return !!api.updates;
    case Capability.AgentHost:
      return !!api.agentHost;
  }
}

/** e2e only: the shell was launched with CRUX_AI_MOCK=1 — use the scripted model, no key needed. */
export function isAiMock(): boolean {
  return !!bridge()?.test?.aiMock;
}
