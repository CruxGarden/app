// ── Re-export entity types from API types ────────────
// The service layer uses the same entity shapes as the API client.
// No duplication — single source of truth.

export type {
  Crux,
  CruxKind,
  CruxStatus,
  CruxVisibility,
  CruxMeta,
  CruxSummary,
  ChatMessage,
  ToolCall,
  Attachment,
  Dimension,
  DimensionType,
  Author,
  CruxEmbed,
} from '@/api/types';

// ── Service Input Types ──────────────────────────────
// These define what callers pass to service methods.
// Intentionally minimal — services fill in defaults.

export interface CreateCruxInput {
  title?: string;
  slug?: string;
  description?: string;
  data?: string;
  type?: string;
  kind?: 'webapp' | 'page' | 'document' | 'image';
  authorId?: string;
  homeId?: string;
  meta?: Record<string, unknown>;
}

export interface UpdateCruxInput {
  title?: string;
  slug?: string;
  description?: string;
  data?: string;
  type?: string;
  kind?: 'webapp' | 'page' | 'document' | 'image' | null;
  status?: 'living' | 'frozen';
  visibility?: 'public' | 'private' | 'unlisted';
  meta?: Record<string, unknown>;
  remoteId?: string;
}

export interface CreateAttachmentInput {
  resourceId: string;
  resourceType?: string;
  content: string;
  mimeType?: string;
  meta?: { path?: string; [key: string]: unknown };
}

export interface UploadAttachmentInput {
  resourceId: string;
  resourceType?: string;
  blob: Blob;
  mimeType?: string;
  kind?: string;
  type?: string;
  meta?: { path?: string; growthId?: string; [key: string]: unknown };
}

export interface UpdateAttachmentInput {
  meta?: { path?: string; [key: string]: unknown };
  mimeType?: string;
  filename?: string;
}

export interface CreateDimensionInput {
  sourceId: string;
  targetId: string;
  type: 'gate' | 'garden' | 'growth' | 'graft';
  kind?: string;
  weight?: number;
  note?: string;
  meta?: Record<string, unknown>;
}

export interface UpdateDimensionInput {
  kind?: string;
  weight?: number;
  note?: string;
  meta?: Record<string, unknown>;
}

export interface CreateAuthorInput {
  username: string;
  displayName: string;
  accountId?: string;
  homeId?: string;
}

export interface UpdateAuthorInput {
  username?: string;
  displayName?: string;
  bio?: string;
  meta?: Record<string, unknown>;
}

// ── Error Types ──────────────────────────────────────

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message, 'VALIDATION');
    this.name = 'ValidationError';
  }
}

// ── Normalized Message Type (for AI engine) ──────────

export interface NormalizedMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };
