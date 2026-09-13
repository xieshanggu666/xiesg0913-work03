import { describe, expect, it } from 'vitest';
import { buildExportPreview, type ExportPreviewInput } from '@shared/export-preview';
import type { Comment, Folio, Layer, PlanVersion, Project, RestorationStep, Shape } from '@shared/types';

/**
 * 导出预览纯函数测试：信息汇总、三类归档风险、校验清单、阻断/确认口径。
 */

const NOW = new Date('2026-09-12T08:00:00.000Z');

const project: Project = {
  id: 'prj_t',
  name: '测试卷',
  author: '测试员',
  shelf_no: 'T-1',
  era: '清',
  description: '',
  created_at: '2026-09-10T08:00:00.000Z',
  updated_at: '2026-09-11T08:00:00.000Z'
};

function folio(id: string, sequence: number, hasAfter = false): Folio {
  return {
    id,
    project_id: project.id,
    name: `第${sequence}叶`,
    sequence,
    original_rel: `original/${id}.png`,
    original_checksum: 'x',
    width: 100,
    height: 100,
    thumb_rel: `thumb/${id}.jpg`,
    after_rel: hasAfter ? `after/${id}.png` : null,
    after_checksum: hasAfter ? 'y' : null,
    imported_at: '2026-09-10T08:00:00.000Z',
    note: ''
  };
}

function layersFor(fid: string): Layer[] {
  return (['damage', 'repair', 'note'] as const).map((kind, i) => ({
    id: `lay_${fid}_${kind}`,
    folio_id: fid,
    name: kind,
    kind,
    color: '#000',
    visible: true,
    locked: false,
    opacity: 0.5,
    order_index: i,
    created_at: '2026-09-10T08:00:00.000Z'
  }));
}

function shape(id: string, fid: string, kind: 'damage' | 'repair'): Shape {
  return {
    id,
    folio_id: fid,
    layer_id: `lay_${fid}_${kind}`,
    damage: 'wormhole',
    geometry: { type: 'rect', x: 0, y: 0, w: 10, h: 10 },
    label: '',
    note: '',
    area_px: 100,
    order_index: 1,
    created_at: '2026-09-10T08:00:00.000Z'
  };
}

function step(id: string, fid: string | null): RestorationStep {
  return {
    id,
    project_id: project.id,
    folio_id: fid,
    order_index: 1,
    title: '干揭',
    technique: '干揭',
    material_ids: [],
    operator: '测试员',
    performed_at: '2026-09-11',
    duration_min: 30,
    photo_rel: null,
    note: '',
    created_at: '2026-09-11T08:00:00.000Z'
  };
}

function comment(id: string, resolved: boolean): Comment {
  return {
    id,
    project_id: project.id,
    folio_id: null,
    target_type: 'project',
    target_id: null,
    author: '复核员',
    body: '意见',
    resolved,
    created_at: '2026-09-11T08:00:00.000Z'
  };
}

function baselineVersion(fid: string): PlanVersion {
  return {
    id: `ver_base_${fid}`,
    project_id: project.id,
    folio_id: fid,
    version: 1,
    label: '建档基线',
    note: '',
    author: 'system',
    snapshot: { layers: [], shapes: [] },
    created_at: '2026-09-10T08:00:00.000Z'
  };
}

function base(over: Partial<ExportPreviewInput> = {}): ExportPreviewInput {
  const f1 = folio('fol_1', 1);
  return {
    project,
    folios: [f1],
    layers: layersFor(f1.id),
    shapes: [],
    steps: [],
    comments: [],
    versions: [baselineVersion(f1.id)],
    now: NOW,
    ...over
  };
}

describe('导出预览 buildExportPreview', () => {
  it('汇总基本信息与计数', () => {
    const f1 = folio('fol_1', 1, true);
    const p = buildExportPreview(
      base({
        folios: [f1],
        layers: layersFor(f1.id),
        shapes: [shape('s1', f1.id, 'damage'), shape('s2', f1.id, 'repair')],
        steps: [step('st1', f1.id)],
        comments: [comment('c1', true)],
        versions: [baselineVersion(f1.id), { ...baselineVersion(f1.id), id: 'v2', version: 2, author: '测试员' }]
      })
    );
    expect(p.project.name).toBe('测试卷');
    expect(p.counts.folios).toBe(1);
    expect(p.counts.damageShapes).toBe(1);
    expect(p.counts.repairShapes).toBe(1);
    expect(p.counts.steps).toBe(1);
    expect(p.counts.resolvedComments).toBe(1);
    expect(p.counts.unresolvedComments).toBe(0);
    expect(p.counts.afterImages).toBe(1);
    expect(p.counts.manualVersions).toBe(1);
    expect(p.folios[0].hasAfter).toBe(true);
  });

  it('三类归档风险：缺修复后图、未解决批注、方案未保存版本', () => {
    const f1 = folio('fol_1', 1, false);
    // 有标注 + 有工序但无修复后图；只有 system 基线（未人工存版）
    const p = buildExportPreview(
      base({
        folios: [f1],
        layers: layersFor(f1.id),
        shapes: [shape('s1', f1.id, 'damage')],
        steps: [step('st1', f1.id)],
        comments: [comment('c1', false)]
      })
    );
    const codes = p.risks.map((r) => r.code).sort();
    expect(codes).toEqual(['missing-after-image', 'plan-not-versioned', 'unresolved-comments']);
    expect(p.canExport).toBe(true); // 风险仅需确认，不阻断
    expect(p.hasWarnings).toBe(true);
    const afterCheck = p.checklist.find((c) => c.code === 'after-images')!;
    expect(afterCheck.status).toBe('warn');
    expect(p.checklist.find((c) => c.code === 'comments')!.status).toBe('warn');
    expect(p.checklist.find((c) => c.code === 'plan-versions')!.status).toBe('warn');
  });

  it('已存版（快照与当前一致）+ 已解决批注 + 有修复后图 → 无风险', () => {
    const f1 = folio('fol_1', 1, true);
    const mediaExists = new Map<string, boolean>([
      [f1.original_rel, true],
      [f1.thumb_rel, true],
      [f1.after_rel!, true]
    ]);
    const fLayers = layersFor(f1.id);
    const fShapes = [shape('s1', f1.id, 'damage'), shape('s2', f1.id, 'repair')];
    const saved: PlanVersion = {
      ...baselineVersion(f1.id),
      id: 'v2',
      version: 2,
      author: '修复师',
      snapshot: { layers: fLayers, shapes: fShapes }
    };
    const p = buildExportPreview(
      base({
        folios: [f1],
        layers: fLayers,
        shapes: fShapes,
        steps: [step('st1', f1.id)],
        comments: [comment('c1', true)],
        versions: [baselineVersion(f1.id), saved],
        mediaExists,
        checksumMatched: new Map([[f1.id, true]])
      })
    );
    expect(p.risks).toHaveLength(0);
    expect(p.hasWarnings).toBe(false);
    expect(p.canExport).toBe(true);
    expect(p.folios[0].planSaved).toBe(true);
  });

  it('回归：曾人工存版但之后又改动 → 仍标“方案未保存版本”', () => {
    const f1 = folio('fol_1', 1, true);
    const fLayers = layersFor(f1.id);
    const currentShapes = [shape('s1', f1.id, 'damage'), shape('s2', f1.id, 'repair')];
    // 存版时只有 s1，之后新增了 s2 → 旧版本不代表当前方案
    const stale: PlanVersion = {
      ...baselineVersion(f1.id),
      id: 'v2',
      version: 2,
      author: '修复师',
      snapshot: { layers: fLayers, shapes: [currentShapes[0]] }
    };
    const p = buildExportPreview(
      base({
        folios: [f1],
        layers: fLayers,
        shapes: currentShapes,
        comments: [comment('c1', true)],
        versions: [baselineVersion(f1.id), stale]
      })
    );
    const risk = p.risks.find((r) => r.code === 'plan-not-versioned');
    expect(risk).toBeTruthy();
    expect(risk!.detail).toContain('存版后');
    expect(p.folios[0].planSaved).toBe(false);
    expect(p.folios[0].hasManualVersion).toBe(true);
    expect(p.checklist.find((c) => c.code === 'plan-versions')!.detail).toContain('又有改动');
  });

  it('回退到历史版本（当前与该快照一致）→ 视为已保存', () => {
    const f1 = folio('fol_1', 1, true);
    const fLayers = layersFor(f1.id);
    const fShapes = [shape('s1', f1.id, 'damage')];
    const old: PlanVersion = {
      ...baselineVersion(f1.id),
      id: 'v3',
      version: 3,
      author: '修复师',
      snapshot: { layers: fLayers, shapes: fShapes }
    };
    const p = buildExportPreview(
      base({ folios: [f1], layers: fLayers, shapes: fShapes, versions: [baselineVersion(f1.id), old] })
    );
    expect(p.risks.filter((r) => r.code === 'plan-not-versioned')).toHaveLength(0);
    expect(p.folios[0].planSaved).toBe(true);
  });

  it('回归：存版后把标注全部删除 → 仍须提示方案未保存（不能因空状态匹配 system 基线而漏报）', () => {
    const f1 = folio('fol_1', 1, true);
    const fLayers = layersFor(f1.id);
    // 人工版本快照里有 s1；当前标注被全部删除（空状态仅与 system 基线一致）
    const saved: PlanVersion = {
      ...baselineVersion(f1.id),
      id: 'v2',
      version: 2,
      author: '修复师',
      snapshot: { layers: fLayers, shapes: [shape('s1', f1.id, 'damage')] }
    };
    const p = buildExportPreview(base({ folios: [f1], layers: fLayers, shapes: [], versions: [baselineVersion(f1.id), saved] }));
    const risk = p.risks.find((r) => r.code === 'plan-not-versioned');
    expect(risk).toBeTruthy();
    expect(risk!.detail).toContain('全部删除');
    expect(p.folios[0].planSaved).toBe(false);
    expect(p.folios[0].hasManualVersion).toBe(true);
    expect(p.checklist.find((c) => c.code === 'plan-versions')!.status).toBe('warn');
  });

  it('从未人工存版且当前无标注（刚导入的空叶）→ 不提示未保存', () => {
    const p = buildExportPreview(base());
    expect(p.risks.filter((r) => r.code === 'plan-not-versioned')).toHaveLength(0);
    expect(p.folios[0].planSaved).toBe(false);
    expect(p.checklist.find((c) => c.code === 'plan-versions')!.status).toBe('pass');
  });

  it('没有人工存版但也没有标注 → 不提示未存版', () => {
    const p = buildExportPreview(base());
    expect(p.risks.filter((r) => r.code === 'plan-not-versioned')).toHaveLength(0);
  });

  it('无扫描叶 → 清单项 fail 且 canExport=false', () => {
    const p = buildExportPreview(base({ folios: [], layers: [], versions: [] }));
    expect(p.checklist.find((c) => c.code === 'folios')!.status).toBe('fail');
    expect(p.canExport).toBe(false);
  });

  it('mediaExists 注入缺失原图 → fail 阻断；checksumMatched 不一致 → fail', () => {
    const f1 = folio('fol_1', 1);
    const mediaExists = new Map<string, boolean>();
    mediaExists.set(f1.original_rel, false);
    mediaExists.set(f1.thumb_rel, true);
    let p = buildExportPreview(base({ folios: [f1], mediaExists }));
    expect(p.checklist.find((c) => c.code === 'original-readonly')!.status).toBe('fail');
    expect(p.canExport).toBe(false);

    mediaExists.set(f1.original_rel, true);
    p = buildExportPreview(base({ folios: [f1], mediaExists, checksumMatched: new Map([[f1.id, false]]) }));
    expect(p.checklist.find((c) => c.code === 'original-readonly')!.status).toBe('fail');
    expect(p.canExport).toBe(false);

    // 文件存在且校验一致 → pass
    p = buildExportPreview(base({ folios: [f1], mediaExists, checksumMatched: new Map([[f1.id, true]]) }));
    expect(p.checklist.find((c) => c.code === 'original-readonly')!.status).toBe('pass');
  });

  it('浏览器环境不注入文件校验 → 原图项为 warn 而非 fail，仍可导出', () => {
    const p = buildExportPreview(base());
    expect(p.checklist.find((c) => c.code === 'original-readonly')!.status).toBe('warn');
    expect(p.canExport).toBe(true);
  });

  it('项目名缺失 → 基本信息项 fail', () => {
    const p = buildExportPreview(base({ project: { ...project, name: '' } }));
    expect(p.checklist.find((c) => c.code === 'project-info')!.status).toBe('fail');
    expect(p.canExport).toBe(false);
  });

  it('records 原样带出（按时间倒序由仓库层负责，这里只透传）', () => {
    const rec = {
      id: 'exp_1',
      project_id: project.id,
      status: 'failed' as const,
      include_original: true,
      operator: '修复员',
      created_at: '2026-09-12T09:00:00.000Z',
      file_name: null,
      bytes: null,
      folio_count: null,
      checksum_summary: null,
      error: '缺少媒体文件'
    };
    const p = buildExportPreview(base({ records: [rec] }));
    expect(p.records).toHaveLength(1);
    expect(p.records[0].error).toBe('缺少媒体文件');
  });
});
