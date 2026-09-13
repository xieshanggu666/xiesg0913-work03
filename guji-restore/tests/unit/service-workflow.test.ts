import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 主进程集成测试：在临时数据目录上跑通
 * 建项目 → 导入合成原图(只读) → 图层/标注 → 版本保存/回退 → 工序 → 批注 → 档案 zip → 原图不变
 *
 * 直接用 tsx/esbuild 不便引入，测试通过动态 import 由 vitest 的 esbuild 转译 TS。
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import AdmZip from 'adm-zip';

async function loadServices() {
  const [svcMod, imgMod, archMod] = await Promise.all([
    import('../../electron/services/services'),
    import('../../electron/services/images'),
    import('../../electron/services/archive')
  ]);
  return { ...svcMod, ...imgMod, exportProjectArchive: archMod.exportProjectArchive };
}

async function makeTestImage(path: string, color = '#e8d9b8') {
  await sharp({
    create: { width: 200, height: 300, channels: 3, background: color }
  })
    .png()
    .toFile(path);
}

describe('主进程工作流（SQLite + sharp + zip）', () => {
  it('完整链路：只读原图、版本快照与回退、导出校验', async () => {
    const s = await loadServices();
    const root = mkdtempSync(join(tmpdir(), 'guji-it-'));
    const ctx = new s.ServiceContext(root);

    const project = s.createProject(ctx, {
      name: '集成测试卷',
      author: '测试员',
      shelf_no: 'IT-1',
      era: '当代',
      description: ''
    });

    // 1) 合成原图并导入
    const src = join(root, 'src.png');
    await makeTestImage(src);
    const before = statSync(src);
    const [folio] = await s.importFolios(ctx, project.id, [{ name: 'src.png', srcPath: src }]);
    expect(folio.width).toBe(200);
    expect(folio.height).toBe(300);
    expect(folio.original_checksum).toHaveLength(64);

    // 原图副本只读（0o444）；源文件未受影响
    const copyAbs = join(ctx.projectDir(project.id), folio.original_rel);
    const mode = statSync(copyAbs).mode & 0o777;
    expect(mode).toBe(0o444);
    expect(statSync(src).mtimeMs).toBe(before.mtimeMs);

    // 缩略图存在
    expect(existsSync(join(ctx.projectDir(project.id), folio.thumb_rel))).toBe(true);

    // 2) 图层 / 标注（默认三层 + 基线版本）
    let layers = s.listLayers(ctx, folio.id);
    expect(layers.map((l) => l.kind)).toEqual(['damage', 'repair', 'note']);
    const damageLayer = layers[0];
    const shp = s.createShape(ctx, folio.id, {
      layer_id: damageLayer.id,
      damage: 'wormhole',
      geometry: { type: 'rect', x: 10, y: 20, w: 30, h: 40 }
    });
    expect(shp.area_px).toBe(1200);

    let versions = s.listVersions(ctx, folio.id);
    expect(versions).toHaveLength(1);
    const v2 = s.saveVersion(ctx, folio.id, { label: '初勘', note: '', author: '测试员' });
    expect(v2.version).toBe(2);

    // 再标注后回退到 v2：先自动备份，再还原
    s.createShape(ctx, folio.id, {
      layer_id: damageLayer.id,
      damage: 'tear',
      geometry: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }] }
    });
    expect(s.listShapes(ctx, folio.id)).toHaveLength(2);
    const restored = s.restoreVersion(ctx, v2.id, '测试员');
    expect(restored.version).toBe(2);
    expect(s.listShapes(ctx, folio.id)).toHaveLength(1);
    // 回退前自动备份成为最新版（可再次“前进”）
    versions = s.listVersions(ctx, folio.id);
    expect(versions[0].label).toContain('自动备份');
    const backup = versions[0];
    s.restoreVersion(ctx, backup.id, '测试员');
    expect(s.listShapes(ctx, folio.id)).toHaveLength(2);

    // 3) 取色走 sharp（整图平均）
    const avg = await s.folioAverageColor(ctx, folio.id, null);
    expect(avg.hex).toMatch(/^#[0-9a-f]{6}$/);

    // 4) 材料/样本 + 推荐（走共享算法，主进程库）
    const sample = s.createSample(ctx, {
      project_id: null,
      kind: 'paper',
      name: 'IT 纸',
      source: '',
      color_hex: '#e8d9b8',
      lab: null,
      fiber: '青檀皮',
      grain: '',
      thickness_mm: 0.09,
      absorbency: '中',
      image_rel: null,
      note: ''
    });
    const recs = s.recommend(ctx, sample.id, ['xuan', 'mian', 'pi']);
    expect(Array.isArray(recs)).toBe(true);

    // 5) 工序 + 批注
    s.createStep(ctx, {
      project_id: project.id,
      folio_id: folio.id,
      order_index: 1,
      title: '干揭',
      technique: '干揭',
      material_ids: [],
      operator: '测试员',
      performed_at: '2026-09-01',
      duration_min: 40,
      photo_rel: null,
      note: ''
    });
    expect(s.listSteps(ctx, project.id)).toHaveLength(1);
    s.createComment(ctx, {
      project_id: project.id,
      folio_id: folio.id,
      target_type: 'folio',
      author: '复核员',
      body: '注意补纸色差'
    });
    expect(s.listComments(ctx, project.id)).toHaveLength(1);

    // 6) 修复后图（不覆盖原图）
    const afterSrc = join(root, 'after.png');
    await makeTestImage(afterSrc, '#ece0c2');
    await s.setAfterImage(ctx, folio.id, afterSrc);
    const folioAfter = s.listFolios(ctx, project.id)[0];
    expect(folioAfter.after_rel).toBeTruthy();

    // 7) 导出 zip：文件齐全，HTML/清单/校验；原图 sha256 与入库一致
    const zipPath = join(root, 'a.zip');
    const result = s.exportProjectArchive(ctx, project.id, { includeOriginal: true, destZip: zipPath });
    expect(result.folio_count).toBe(1);
    const zip = new AdmZip(zipPath);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain('index.html');
    expect(names).toContain('manifest.json');
    expect(names).toContain('checksums.txt');
    expect(names.some((n) => n.startsWith('original/'))).toBe(true);
    expect(names.some((n) => n.startsWith('after/'))).toBe(true);

    const html = zip.getEntry('index.html')!.getData().toString('utf8');
    expect(html).toContain('集成测试卷');
    expect(html).toContain('虫蛀');

    const checksums = zip.getEntry('checksums.txt')!.getData().toString('utf8');
    const line = checksums.split('\n').find((l) => l.includes(folio.original_rel.replace(/\\/g, '/')));
    expect(line).toBeTruthy();
    expect(line!.split('  ')[0]).toBe(folio.original_checksum);

    // manifest.json 自身校验和必须一致（防止“写的内容”和“签的内容”不一致）
    const manifestLine = checksums.split('\n').find((l) => l.endsWith(' manifest.json'));
    expect(manifestLine).toBeTruthy();
    const manifestHash = createHash('sha256')
      .update(zip.getEntry('manifest.json')!.getData())
      .digest('hex');
    expect(manifestLine!.split('  ')[0]).toBe(manifestHash);

    // 8) 原图内容字节未因后续操作变化
    const afterBytes = readFileSync(copyAbs);
    expect(createHash('sha256').update(afterBytes).digest('hex')).toBe(folio.original_checksum);
    // 只读位仍在（未做删除重建）
    expect(statSync(copyAbs).mode & 0o200).toBe(0);

    // 9) 项目统计
    const stats = s.projectStats(ctx, project.id);
    expect(stats.folios).toBe(1);
    expect(stats.steps).toBe(1);
    expect(stats.comments).toBe(1);
    expect(stats.shapes).toBe(2);

    // 10) 项目活动时间：批注 / 编辑工序 / 删除标注都会推进 project.updated_at
    // （看板“项目久未更新”风险依赖该时间，漏报曾导致误报停滞）
    const libDb = ctx.library();
    const OLD = '2020-01-01T00:00:00.000Z';
    const freeze = () =>
      libDb.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(OLD, project.id);
    const updatedAt = () =>
      (libDb.prepare('SELECT updated_at AS u FROM projects WHERE id = ?').get(project.id) as any).u as string;

    freeze();
    s.createComment(ctx, {
      project_id: project.id,
      folio_id: null,
      target_type: 'project',
      author: '复核员',
      body: '新增一条批注'
    });
    expect(updatedAt() > OLD).toBe(true);

    freeze();
    const [stp] = s.listSteps(ctx, project.id);
    s.updateStep(ctx, stp.id, { note: '补充：边缘先加固' });
    expect(updatedAt() > OLD).toBe(true);

    // 删除标注：真正从所属项目库删除（回归：曾误用 folio_id 打开空库并抛错），且推进更新时间
    freeze();
    s.removeShape(ctx, shp.id);
    expect(s.listShapes(ctx, folio.id).some((x) => x.id === shp.id)).toBe(false);
    expect(updatedAt() > OLD).toBe(true);

    unlinkSync(zipPath);
  }, 30_000);
});
