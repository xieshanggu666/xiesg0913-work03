import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 存储布局（应用数据目录，全部离线、本机）：
 *   guji-data/
 *     library.db                     全局库：项目索引、全局样本、材料
 *     projects/<id>/project.db       项目库：叶、图层、标注、工序、版本、批注
 *     projects/<id>/original/<file>  原图只读副本
 *     projects/<id>/thumb/<file>     sharp 生成的缩略图
 *     projects/<id>/after/<file>     修复后对照图
 *     projects/<id>/photos/<file>    工序照片、样本照片
 */

export function openLibrary(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'library.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(LIBRARY_SCHEMA);
  migrateLibrary(db);
  return db;
}

/** 旧版本库缺少 updated_at 列时补齐，并用 created_at 回填 */
function migrateLibrary(db: DB): void {
  const cols = (table: string) =>
    new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name));
  for (const table of ['samples', 'materials']) {
    const c = cols(table);
    if (!c.has('updated_at')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`);
      db.exec(`UPDATE ${table} SET updated_at = created_at WHERE updated_at = ''`);
    }
  }
}

export function openProject(projectDir: string): DB {
  mkdirSync(projectDir, { recursive: true });
  const db = new Database(join(projectDir, 'project.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(PROJECT_SCHEMA);
  return db;
}

const LIBRARY_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT '',
  shelf_no    TEXT NOT NULL DEFAULT '',
  era         TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS samples (
  id           TEXT PRIMARY KEY,
  project_id   TEXT,                 -- NULL = 全局样本
  kind         TEXT NOT NULL,        -- paper | ink
  name         TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT '',
  color_hex    TEXT NOT NULL DEFAULT '',
  lab_json     TEXT,                 -- LabColor 序列化
  fiber        TEXT NOT NULL DEFAULT '',
  grain        TEXT NOT NULL DEFAULT '',
  thickness_mm REAL,
  absorbency   TEXT NOT NULL DEFAULT '',
  image_rel    TEXT,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_samples_kind ON samples(kind);
CREATE INDEX IF NOT EXISTS idx_samples_project ON samples(project_id);

CREATE TABLE IF NOT EXISTS materials (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  color_hex    TEXT NOT NULL DEFAULT '',
  lab_json     TEXT,
  fiber        TEXT NOT NULL DEFAULT '',
  thickness_mm REAL,
  weight_gsm   REAL,
  weave        TEXT NOT NULL DEFAULT '',
  ph           REAL,
  supplier     TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
`;

const PROJECT_SCHEMA = `
CREATE TABLE IF NOT EXISTS folios (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  name              TEXT NOT NULL,
  sequence          INTEGER NOT NULL DEFAULT 0,
  original_rel      TEXT NOT NULL,
  original_checksum TEXT NOT NULL,
  width             INTEGER NOT NULL,
  height            INTEGER NOT NULL,
  thumb_rel         TEXT NOT NULL,
  after_rel         TEXT,
  after_checksum    TEXT,
  imported_at       TEXT NOT NULL,
  note              TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_folios_seq ON folios(sequence);

CREATE TABLE IF NOT EXISTS layers (
  id          TEXT PRIMARY KEY,
  folio_id    TEXT NOT NULL REFERENCES folios(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  color       TEXT NOT NULL,
  visible     INTEGER NOT NULL DEFAULT 1,
  locked      INTEGER NOT NULL DEFAULT 0,
  opacity     REAL NOT NULL DEFAULT 0.5,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_layers_folio ON layers(folio_id);

CREATE TABLE IF NOT EXISTS shapes (
  id          TEXT PRIMARY KEY,
  folio_id    TEXT NOT NULL REFERENCES folios(id) ON DELETE CASCADE,
  layer_id    TEXT NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  damage      TEXT NOT NULL,
  geom_json   TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  area_px     REAL NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shapes_folio ON shapes(folio_id);
CREATE INDEX IF NOT EXISTS idx_shapes_layer ON shapes(layer_id);

CREATE TABLE IF NOT EXISTS steps (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  folio_id     TEXT REFERENCES folios(id) ON DELETE SET NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  technique    TEXT NOT NULL DEFAULT '',
  material_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array
  operator     TEXT NOT NULL DEFAULT '',
  performed_at TEXT NOT NULL,
  duration_min INTEGER,
  photo_rel    TEXT,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_steps_order ON steps(order_index);

CREATE TABLE IF NOT EXISTS plan_versions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  folio_id    TEXT NOT NULL REFERENCES folios(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  author      TEXT NOT NULL DEFAULT '',
  snapshot    TEXT NOT NULL,             -- PlanSnapshot JSON
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_folio ON plan_versions(folio_id, version);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  folio_id    TEXT,
  target_type TEXT NOT NULL,
  target_id   TEXT,
  author      TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  resolved    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);

CREATE TABLE IF NOT EXISTS export_records (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  status           TEXT NOT NULL,            -- success | failed
  include_original INTEGER NOT NULL DEFAULT 1,
  operator         TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  file_name        TEXT,                     -- 成功：zip 绝对路径（档案文件名）
  bytes            INTEGER,
  folio_count      INTEGER,
  checksum_json    TEXT,                     -- ChecksumSummary JSON
  error            TEXT                      -- 失败：可读原因
);
CREATE INDEX IF NOT EXISTS idx_exports_project ON export_records(project_id, created_at);
`;
