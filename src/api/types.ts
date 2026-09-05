/**
 * App-side types for API entities.
 *
 * These are DOMAIN types, not pure wire types: entities like Crux and
 * Artifact extend what the server returns with local-only fields (e.g.
 * `Artifact.fingerprint` — the Blob Store key; `Crux.meta` strongly typed;
 * `themeId`) that exist only in the local SQLite store.
 *
 * The wire contract itself is generated from the API's OpenAPI document into
 * ./generated/schema.d.ts (`npm run generate:api`, after `npm run openapi` in
 * api/). ./contract-check.ts statically asserts the request DTOs below stay
 * assignable to the generated wire DTOs — contract drift fails `tsc`.
 */

// ── Auth ───────────────────────────────────────────────

export interface AuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Profile {
  id: string;
  email: string;
  role: 'admin' | 'author' | 'keeper';
  homeId: string;
  created: string;
  updated: string;
  author: Author | null;
}

// ── Account ───────────────────────────────────────────

export interface Account {
  id: string;
  email: string;
  role: 'admin' | 'author' | 'keeper';
  homeId: string;
  meta?: Record<string, unknown>;
  created: string;
  updated: string;
}

export interface UpdateAccountDto {
  email?: string;
}

// ── Author ────────────────────────────────────────────

export interface Author {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  rootId?: string;
  accountId: string;
  homeId: string;
  type?: string;
  kind?: string;
  meta?: Record<string, unknown>;
  created: string;
  updated: string;
  root?: Crux;
}

export interface CreateAuthorDto {
  username: string;
  displayName: string;
  bio?: string;
}

export interface UpdateAuthorDto {
  username?: string;
  displayName?: string;
  bio?: string;
  rootId?: string;
}

// ── Crux ──────────────────────────────────────────────

export type CruxStatus = 'living' | 'frozen';
export type CruxVisibility = 'public' | 'private' | 'unlisted';

export interface Crux {
  id: string;
  slug: string;
  title?: string;
  description?: string;
  data: string;
  type?: string;
  kind?: string;
  status: CruxStatus;
  visibility: CruxVisibility;
  discoverable: boolean;
  authorId: string;
  homeId: string;
  themeId?: string;
  meta?: CruxMeta;
  created: string;
  updated: string;
}

export type CruxKind = 'webapp' | 'page' | 'document' | 'image' | 'snapshot' | 'notes' | 'mood';

export interface CreateCruxDto {
  id?: string;
  slug: string;
  title?: string;
  description?: string;
  data: string;
  type?: string;
  kind?: CruxKind;
  status?: CruxStatus;
  visibility?: CruxVisibility;
  discoverable?: boolean;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export interface UpdateCruxDto {
  title?: string;
  slug?: string;
  description?: string;
  data?: string;
  type?: string;
  kind?: CruxKind | null;
  status?: CruxStatus;
  visibility?: CruxVisibility;
  discoverable?: boolean;
  tags?: string[];
  meta?: Record<string, unknown>;
}

// ── V3 Meta Structures ────────────────────────────────

export interface CruxSummary {
  crux: string;
  purpose: string;
  stage: string;
  themes: string;
  stack: string;
}

export interface GrowthSnapshot {
  title: string;
  state: string;
  decision: string;
  rejected: string;
  reason: string;
  artifacts: string;
  open: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  model?: string;
  toolCalls?: ToolCall[];
  /** Persona identity fingerprint — messages without a matching fingerprint are excluded from AI context */
  personaFingerprint?: string;
  /** Author UUID for user messages — resolved via crux.meta.authorSnapshots */
  authorId?: string;
  /** The Background Turn that produced this reply, once it finished (B3). */
  job?: TurnJobSummary;
  /** External agent (MCP client name) whose tool calls this message records — ADR 0013 */
  agent?: string;
  /**
   * The app wrote this message on the person's side of the transcript — the
   * check's findings handed back to the model (B4). Shown as "Check", never
   * as the person.
   */
  origin?: 'check';
}

/** Compact record of a finished Background Turn — the transcript's "Ran 3 steps · 2 snapshots". */
export interface TurnJobSummary {
  status: 'done' | 'failed' | 'interrupted';
  steps: number;
  completedSteps: number;
  snapshots: number;
  /** Verify-before-done outcome (B4), once a check ran on this turn. */
  check?: TurnCheckSummary;
}

/** What the transcript keeps of a check: the verdict and the screenshot it took. */
export interface TurnCheckSummary {
  status: 'passed' | 'problems';
  problems: string[];
  /** Blob Store fingerprint of the final screenshot. */
  thumbnailFingerprint?: string;
}

export interface ToolCall {
  id?: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
}

export interface CruxMeta {
  summary?: CruxSummary | null;
  messages?: ChatMessage[];
  settings?: {
    model?: string;
    systemPrompt?: string;
    palette?: Record<string, string>;
    snapshotFrequency?: string;
    activeBranch?: string;
    /** Agent Host switched on for this crux (MCP server per crux, ADR 0013). Off by default. */
    agentHost?: boolean;
    /** Check automatically after a turn that claims to be done (B4). On unless false. */
    verifyOnDone?: boolean;
  };
  growthCount?: number;
  snapshot?: GrowthSnapshot;
  tags?: string[];
  artifactRefs?: string[];
  parentCruxId?: string;
  [key: string]: unknown;
}

// ── Dimension ─────────────────────────────────────────

export type DimensionType = 'gate' | 'garden' | 'growth' | 'graft';

export interface Dimension {
  id: string;
  sourceId: string;
  targetId: string;
  type: DimensionType;
  kind?: string;
  weight?: number;
  note?: string;
  authorId?: string;
  homeId: string;
  meta?: Record<string, unknown>;
  created: string;
  updated: string;
  source?: CruxEmbed;
  target?: CruxEmbed;
}

export interface CruxEmbed {
  id: string;
  slug?: string;
  title?: string;
  data?: string;
}

export interface CreateDimensionDto {
  targetId: string;
  type: DimensionType;
  weight?: number;
  note?: string;
}

// ── Path ──────────────────────────────────────────────

export type PathKind = 'guide' | 'wander';

export interface Path {
  id: string;
  slug: string;
  title?: string;
  description?: string;
  type: string;
  visibility: CruxVisibility;
  kind: PathKind;
  entry: string;
  authorId: string;
  homeId: string;
  themeId?: string;
  meta?: Record<string, unknown>;
  created: string;
  updated: string;
}

export interface Marker {
  id: string;
  pathId: string;
  cruxId: string;
  order: number;
  note?: string;
  authorId: string;
  homeId: string;
  created: string;
  updated: string;
}

// ── Theme ─────────────────────────────────────────────

export interface Theme {
  id: string;
  title: string;
  description?: string;
  type?: string;
  kind?: string;
  system: boolean;
  meta: Record<string, unknown>;
  authorId: string;
  homeId: string;
  created: string;
  updated: string;
}

// ── Tag ───────────────────────────────────────────────

export type ResourceType = 'author' | 'crux' | 'dimension' | 'path' | 'tag' | 'theme';

export interface Tag {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  label: string;
  authorId: string;
  homeId: string;
  system: boolean;
  created: string;
  updated: string;
}

// ── Artifact ────────────────────────────────────────

export interface Artifact {
  id: string;
  type: string;
  kind: string;
  meta?: { path?: string; growthId?: string; [key: string]: unknown };
  resourceId: string;
  resourceType: string;
  authorId: string;
  homeId: string;
  encoding: string;
  mimeType: string;
  filename: string;
  size: number;
  fingerprint?: string;
  created: string;
  updated: string;
}

// ── Pagination ────────────────────────────────────────

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
}
