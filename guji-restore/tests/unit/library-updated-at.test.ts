import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openLibrary } from '../../electron/db/schema';
import * as repo from '../../electron/db/repo';

/**
 * 样本库/材料库的 updated_at：
 *  - 新建时与 created_at 一致
 *  - 更新后晚于旧值
 *  - 旧版本数据库（无 updated_at 列）打开时自动补列并用 created_at 回填
 */
describe('样本/材料库 updated_at 与迁移', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'guji-lib-'));
  });
  afterEach(() => {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('新建样本时 updated_at = created_at，更新后 updated_at 前进', async () => {
    db = openLibrary(dir);
    const created = new Date(Date.now() - 10_000).toISOString();
    repo.insertSample(db, {
      id: 'smp_1',
      project_id: null,
      kind: 'paper',
      name: '旧纸',
      source: '',
      color_hex: '#e7dcc0',
      lab: null,
      fiber: '',
      grain: '',
      thickness_mm: null,
      absorbency: '',
      image_rel: null,
      note: '',
      created_at: created,
      updated_at: created
    });

    await new Promise((r) => setTimeout(r, 15));
    const updated = repo.updateSampleRow(db, 'smp_1', { name: '旧纸（改名）' });
    expect(updated.created_at).toBe(created);
    expect(updated.updated_at > created).toBe(true);
    expect(updated.name).toBe('旧纸（改名）');
  });

  it('新建材料与更新材料维护 updated_at，列表按更新时间倒序', async () => {
    db = openLibrary(dir);
    const t0 = new Date(Date.now() - 20_000).toISOString();
    repo.insertMaterial(db, {
      id: 'mat_1',
      name: '先建的纸',
      category: 'xuan',
      color_hex: '#efe6cf',
      lab: null,
      fiber: '',
      thickness_mm: null,
      weight_gsm: null,
      weave: '',
      ph: null,
      supplier: '',
      note: '',
      created_at: t0,
      updated_at: t0
    });
    const t1 = new Date(Date.now() - 10_000).toISOString();
    repo.insertMaterial(db, {
      id: 'mat_2',
      name: '后建的纸',
      category: 'xuan',
      color_hex: '#efe6cf',
      lab: null,
      fiber: '',
      thickness_mm: null,
      weight_gsm: null,
      weave: '',
      ph: null,
      supplier: '',
      note: '',
      created_at: t1,
      updated_at: t1
    });

    expect(repo.listMaterials(db).map((m) => m.id)).toEqual(['mat_2', 'mat_1']);

    await new Promise((r) => setTimeout(r, 15));
    repo.updateMaterialRow(db, 'mat_1', { name: '先建的纸（刚编辑）' });
    expect(repo.listMaterials(db).map((m) => m.id)).toEqual(['mat_1', 'mat_2']);
  });

  it('旧库缺少 updated_at 列时自动补列并用 created_at 回填', () => {
    // 用旧 schema 手动建库
    const legacy = new Database(join(dir, 'library.db'));
    legacy.exec(`
      CREATE TABLE samples (
        id TEXT PRIMARY KEY, project_id TEXT, kind TEXT NOT NULL, name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT '', color_hex TEXT NOT NULL DEFAULT '', lab_json TEXT,
        fiber TEXT NOT NULL DEFAULT '', grain TEXT NOT NULL DEFAULT '', thickness_mm REAL,
        absorbency TEXT NOT NULL DEFAULT '', image_rel TEXT, note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE TABLE materials (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
        color_hex TEXT NOT NULL DEFAULT '', lab_json TEXT, fiber TEXT NOT NULL DEFAULT '',
        thickness_mm REAL, weight_gsm REAL, weave TEXT NOT NULL DEFAULT '', ph REAL,
        supplier TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      INSERT INTO samples (id, kind, name, created_at) VALUES ('smp_old', 'paper', '旧样本', '2020-01-01T00:00:00.000Z');
      INSERT INTO materials (id, name, category, created_at) VALUES ('mat_old', '旧材料', 'xuan', '2020-01-02T00:00:00.000Z');
    `);
    legacy.close();

    db = openLibrary(dir); // 触发迁移
    const s = repo.listSamples(db)[0];
    expect(s.updated_at).toBe('2020-01-01T00:00:00.000Z');
    const m = repo.listMaterials(db)[0];
    expect(m.updated_at).toBe('2020-01-02T00:00:00.000Z');
  });
});
