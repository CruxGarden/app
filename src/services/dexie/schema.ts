import Dexie, { type Table } from 'dexie';
import type { Crux, Author, Dimension } from '../types';

// ── Internal Dexie Record Types ──────────────────────
// ArtifactRecord is the full row stored in IndexedDB.
// It has all Attachment fields plus Dexie-only fields.

export interface ArtifactRecord {
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
  created: string;
  updated: string;
  // Dexie-only fields (not on shared Attachment type)
  path: string;               // top-level mirror of meta.path (for indexing)
  content: string | Blob;     // text as string, binary as Blob
  fingerprint: string;        // SHA-256 hex of content
}

export interface SettingsRecord {
  key: string;
  value: unknown;
}

// ── Database ─────────────────────────────────────────

class CruxDB extends Dexie {
  cruxes!: Table<Crux>;
  artifacts!: Table<ArtifactRecord>;
  dimensions!: Table<Dimension>;
  authors!: Table<Author>;
  settings!: Table<SettingsRecord>;

  constructor() {
    super('cruxgarden');
    this.version(1).stores({
      cruxes: 'id, slug, authorId, updated',
      artifacts: 'id, resourceId, path, [resourceId+path], resourceType, kind, type',
      dimensions: 'id, sourceId, targetId, type, [sourceId+type]',
      authors: 'id, username, accountId',
      settings: 'key',
    });
  }
}

export const db = new CruxDB();
