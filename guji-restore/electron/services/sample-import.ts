import { existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DBType } from 'better-sqlite3';
import type { ID, Material, Project } from '@shared/types';
import { newId, nowIso } from '@shared/id';
import { DAMAGE_META, INITIAL_PLAN_VERSION, LAYER_KIND_META } from '@shared/constants';
import { geometryArea } from '@shared/geometry';
import * as repo from '../db/repo';
import { importAfterImage, importOriginal } from './images';
import { seedMaterials, seedProject, seedSamples } from './seed';
import type { ServiceContext } from './services';

export const SAMPLE_FILES = ['sample-1.png', 'sample-2.png', 'sample-3.png'];
export const SAMPLE_AFTER = 'sample-3-after.png';
const FOLIO_NAMES = ['卷首序', '卷一·第二叶', '卷一·第三叶（虫蛀）'];

/** 首次启动时把种子材料与全局样本写入全局库（幂等） */
export function ensureSeeds(ctx: ServiceContext): void {
  const lib = ctx.library();
  if ((lib.prepare('SELECT COUNT(*) AS n FROM materials').get() as any).n === 0) {
    for (const m of seedMaterials()) {
      const ts = nowIso();
      repo.insertMaterial(lib, { ...m, id: newId('mat_'), created_at: ts, updated_at: ts });
    }
  }
  if ((lib.prepare('SELECT COUNT(*) AS n FROM samples').get() as any).n === 0) {
    for (const s of seedSamples()) {
      const ts = nowIso();
      repo.insertSample(lib, { ...s, id: newId('smp_'), created_at: ts, updated_at: ts });
    }
  }
}

function resolveSamplesDir(): string | null {
  const candidates = [
    process.env.GUJI_RESOURCES_DIR ? join(process.env.GUJI_RESOURCES_DIR, 'samples') : '',
    process.env.GUJI_SAMPLES_DIR || '',
    join(process.cwd(), 'resources', 'samples'),
    join(__dirname, '..', '..', 'resources', 'samples')
  ].filter(Boolean);
  return candidates.find((d) => existsSync(join(d, SAMPLE_FILES[0]))) ?? null;
}

/**
 * 导入内置样例项目（幂等：同一馆藏号只导一次）。
 * 走与用户导入完全相同的通道：原图复制为只读副本、sharp 生成缩略图、建立默认图层与基线版本。
 */
export async function importSampleProject(
  ctx: ServiceContext,
  operator: string
): Promise<{ projectId: ID; folioCount: number }> {
  ensureSeeds(ctx);
  const lib = ctx.library();
  const existed = repo.listProjects(lib).find((p) => p.shelf_no === 'SAMP-GJ-001');
  if (existed) {
    return { projectId: existed.id, folioCount: repo.listFolios(ctx.projectDb(existed.id)).length };
  }

  const srcDir = resolveSamplesDir();
  if (!srcDir) throw new Error('未找到内置样例图（resources/samples/*.png）');

  const now = nowIso();
  const project: Project = { id: newId('prj_'), ...seedProject(), created_at: now, updated_at: now };
  repo.insertProject(lib, project);

  const db: DBType = ctx.projectDb(project.id);
  const pdir = ctx.projectDir(project.id);
  mkdirSync(pdir, { recursive: true });

  for (let i = 0; i < SAMPLE_FILES.length; i++) {
    const folioId = newId('fol_');
    const info = await importOriginal(pdir, join(srcDir, SAMPLE_FILES[i]), folioId);
    const folio = {
      id: folioId,
      project_id: project.id,
      name: FOLIO_NAMES[i],
      sequence: i + 1,
      original_rel: info.originalRel,
      original_checksum: info.checksum,
      width: info.width,
      height: info.height,
      thumb_rel: info.thumbRel,
      after_rel: null,
      after_checksum: null,
      imported_at: now,
      note: ''
    };
    repo.insertFolio(db, folio);
    ensureDefaultLayersFor(db, project.id, folioId);
  }

  const folios = repo.listFolios(db);
  const afterSrc = join(srcDir, SAMPLE_AFTER);
  if (existsSync(afterSrc)) {
    const r = importAfterImage(pdir, folios[2].id, afterSrc);
    repo.updateFolioRow(db, folios[2].id, { after_rel: r.rel, after_checksum: r.checksum });
  }

  const materials = repo.listMaterials(lib);
  seedDemoData(db, project.id, folios, materials, operator);
  return { projectId: project.id, folioCount: folios.length };
}

/** 直接建默认三层 + 基线版本（与 services.importFolios 行为一致，样例直接走底层避免循环） */
function ensureDefaultLayersFor(db: DBType, projectId: ID, folioId: ID): void {
  (['damage', 'repair', 'note'] as const).forEach((kind, i) => {
    repo.insertLayer(db, {
      id: newId('lay_'),
      folio_id: folioId,
      name: { damage: '破损标注', repair: '修补方案', note: '批注' }[kind],
      kind,
      color: LAYER_KIND_META[kind].color,
      visible: true,
      locked: false,
      opacity: 0.5,
      order_index: i,
      created_at: nowIso()
    });
  });
  repo.insertVersion(db, {
    id: newId('ver_'),
    project_id: projectId,
    folio_id: folioId,
    version: INITIAL_PLAN_VERSION,
    label: '建档基线',
    note: '导入扫描时自动建立的空基线',
    author: 'system',
    snapshot: { layers: repo.listLayers(db, folioId), shapes: [] },
    created_at: nowIso()
  });
}

function seedDemoData(
  db: DBType,
  projectId: ID,
  folios: ReturnType<typeof repo.listFolios>,
  materials: Material[],
  operator: string
): void {
  const byName = new Map(folios.map((f) => [f.name, f]));
  const now = nowIso();

  const add = (folioName: string, kind: 'damage' | 'repair', specs: { damage: keyof typeof DAMAGE_META; geometry: any; label: string }[]) => {
    const folio = byName.get(folioName);
    if (!folio) return;
    const layer = repo.listLayers(db, folio.id).find((l) => l.kind === kind)!;
    specs.forEach((spec, i) => {
      repo.insertShape(db, {
        id: newId('shp_'),
        folio_id: folio.id,
        layer_id: layer.id,
        damage: spec.damage,
        geometry: spec.geometry,
        label: spec.label,
        note: '',
        area_px: geometryArea(spec.geometry),
        order_index: i + 1,
        created_at: now
      });
    });
  };

  add('卷一·第三叶（虫蛀）', 'damage', [
    { damage: 'wormhole', geometry: { type: 'ellipse', x: 430, y: 250, w: 46, h: 38 }, label: '虫孔群 A' },
    { damage: 'wormhole', geometry: { type: 'ellipse', x: 570, y: 530, w: 30, h: 26 }, label: '虫孔 B' },
    {
      damage: 'tear',
      geometry: { type: 'polygon', points: [{ x: 130, y: 160 }, { x: 310, y: 190 }, { x: 320, y: 212 }, { x: 140, y: 184 }] },
      label: '横向撕裂'
    },
    { damage: 'foxing', geometry: { type: 'ellipse', x: 650, y: 190, w: 70, h: 60 }, label: '焦斑' }
  ]);
  add('卷一·第三叶（虫蛀）', 'repair', [
    { damage: 'wormhole', geometry: { type: 'ellipse', x: 426, y: 246, w: 54, h: 46 }, label: '拟用净皮棉连嵌补' }
  ]);
  add('卷首序', 'damage', [
    { damage: 'watermark', geometry: { type: 'rect', x: 90, y: 640, w: 520, h: 150 }, label: '版心水痕' }
  ]);
  add('卷一·第二叶', 'damage', [
    { damage: 'mildew', geometry: { type: 'ellipse', x: 490, y: 310, w: 120, h: 90 }, label: '轻度霉变' }
  ]);

  const mian = materials.find((m) => m.name.includes('棉连'));
  const jiang = materials.find((m) => m.category === 'jiang');
  const fol3 = byName.get('卷一·第三叶（虫蛀）')!;
  const stepDefs = [
    { title: '拍照建档与试色', technique: '记录', duration: 30, matIds: [] as string[] },
    { title: '干揭分离叶面', technique: '干揭', duration: 45, matIds: [] },
    { title: '虫孔嵌补', technique: '补洞', duration: 90, matIds: mian ? [mian.id] : [] },
    { title: '整叶托裱压平', technique: '托裱', duration: 60, matIds: jiang ? [jiang.id] : [] }
  ];
  stepDefs.forEach((s, i) => {
    repo.insertStep(db, {
      id: newId('stp_'),
      project_id: projectId,
      folio_id: fol3.id,
      order_index: i + 1,
      title: s.title,
      technique: s.technique,
      material_ids: s.matIds,
      operator,
      performed_at: now.slice(0, 10),
      duration_min: s.duration,
      photo_rel: null,
      note: '',
      created_at: now
    });
  });

  repo.insertComment(db, {
    id: newId('cmt_'),
    project_id: projectId,
    folio_id: fol3.id,
    target_type: 'shape',
    target_id: null,
    author: '张老师（示例）',
    body: '虫孔群边缘有旧补纸残留，嵌补前先做纤维分析，建议先做小样比色。',
    resolved: false,
    created_at: now
  });
  repo.insertComment(db, {
    id: newId('cmt_'),
    project_id: projectId,
    folio_id: null,
    target_type: 'project',
    target_id: null,
    author: '李修复（示例）',
    body: '同意。补纸选用净皮棉连，浆糊偏稀，注意可逆性。',
    resolved: false,
    created_at: now
  });
}
