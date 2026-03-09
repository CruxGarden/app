CREATE TABLE IF NOT EXISTS cruxes (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  data TEXT DEFAULT '',
  type TEXT DEFAULT 'crux',
  kind TEXT,
  status TEXT DEFAULT 'living',
  visibility TEXT DEFAULT 'private',
  author_id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  meta TEXT DEFAULT '{}',
  remote_id TEXT,
  synced_at TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cruxes_slug ON cruxes(slug);
CREATE INDEX IF NOT EXISTS idx_cruxes_author ON cruxes(author_id);
CREATE INDEX IF NOT EXISTS idx_cruxes_updated ON cruxes(updated);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'artifact',
  kind TEXT DEFAULT 'file',
  meta TEXT DEFAULT '{}',
  resource_id TEXT NOT NULL,
  resource_type TEXT DEFAULT 'crux',
  author_id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  encoding TEXT DEFAULT 'utf-8',
  mime_type TEXT,
  filename TEXT,
  size INTEGER DEFAULT 0,
  fingerprint TEXT,
  path TEXT,
  content BLOB,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_resource_path ON artifacts(resource_id, path) WHERE path IS NOT NULL AND path != '';
CREATE INDEX IF NOT EXISTS idx_artifacts_resource ON artifacts(resource_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_fingerprint ON artifacts(fingerprint);

CREATE TABLE IF NOT EXISTS dimensions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  kind TEXT,
  weight REAL,
  author_id TEXT,
  home_id TEXT NOT NULL,
  note TEXT,
  meta TEXT DEFAULT '{}',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dimensions_source ON dimensions(source_id);
CREATE INDEX IF NOT EXISTS idx_dimensions_target ON dimensions(target_id);
CREATE INDEX IF NOT EXISTS idx_dimensions_source_type ON dimensions(source_id, type);

CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  account_id TEXT,
  home_id TEXT,
  meta TEXT DEFAULT '{}',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);
INSERT OR IGNORE INTO schema_version (version) VALUES (1);
