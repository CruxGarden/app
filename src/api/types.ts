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
  authorId: string;
  homeId: string;
  themeId?: string;
  meta?: CruxMeta;
  created: string;
  updated: string;
}

export type CruxKind = 'webapp' | 'page' | 'document' | 'image' | 'snapshot';

export interface CreateCruxDto {
  slug: string;
  title?: string;
  description?: string;
  data: string;
  type?: string;
  kind?: CruxKind;
  status?: CruxStatus;
  visibility?: CruxVisibility;
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
  };
  growthCount?: number;
  snapshot?: GrowthSnapshot;
  artifactRefs?: string[];
  messageRange?: { from: number; to: number };
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

// ── Attachment ────────────────────────────────────────

export interface Attachment {
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
