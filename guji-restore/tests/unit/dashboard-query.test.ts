import { describe, expect, it } from 'vitest';
import type { DashboardReport } from '@shared/dashboard';
import {
  DEFAULT_FILTER,
  DEFAULT_SORT,
  filterFolios,
  filterRisks,
  folioRiskLevels,
  isDefaultFilter,
  queryDashboard
} from '@shared/dashboard-query';

/**
 * 看板筛选/排序纯函数测试：阶段、风险等级、叶名称三个维度组合，
 * 以及分叶表与风险清单在同一筛选条件下的不同语义。
 */

function report(): DashboardReport {
  return {
    generated_at: '2026-09-12T08:00:00.000Z',
    project_id: 'prj_t',
    completion: 40,
    totals: {
      folios: 3,
      damageShapes: 0,
      repairShapes: 0,
      steps: 0,
      comments: 0,
      unresolvedComments: 0,
      afterImages: 0,
      versions: 0,
      damagedAreaPx: 0
    },
    stageReached: { imported: 3, annotated: 1, planned: 0, treated: 0, compared: 0 },
    damageByKind: [],
    techniqueCounts: [],
    folios: [
      { folio_id: 'f1', name: '卷首序', sequence: 1, stage: 'imported', damageCount: 0, repairCount: 0, stepCount: 0, hasAfter: false, damagedAreaPx: 0 },
      { folio_id: 'f2', name: '卷一·第二叶', sequence: 2, stage: 'annotated', damageCount: 2, repairCount: 0, stepCount: 0, hasAfter: false, damagedAreaPx: 100 },
      { folio_id: 'f3', name: '卷一·第三叶（虫蛀）', sequence: 3, stage: 'treated', damageCount: 3, repairCount: 1, stepCount: 2, hasAfter: false, damagedAreaPx: 300 }
    ],
    risks: [
      { level: 'high', code: 'damage-without-plan', title: '破损未立修补方案', detail: '', folio_id: 'f2' },
      { level: 'medium', code: 'no-steps', title: '未见工序记录', detail: '', folio_id: 'f2' },
      { level: 'medium', code: 'missing-after-image', title: '缺修复后对照图', detail: '', folio_id: 'f3' },
      { level: 'high', code: 'high-risk-technique', title: '含高风险工序', detail: '', folio_id: null },
      { level: 'low', code: 'stale-project', title: '项目久未更新', detail: '', folio_id: null }
    ]
  };
}

describe('isDefaultFilter', () => {
  it('默认筛选为默认态，任一字段变化则不是', () => {
    expect(isDefaultFilter(DEFAULT_FILTER)).toBe(true);
    expect(isDefaultFilter({ ...DEFAULT_FILTER, stage: 'treated' })).toBe(false);
    expect(isDefaultFilter({ ...DEFAULT_FILTER, risk: 'high' })).toBe(false);
    expect(isDefaultFilter({ ...DEFAULT_FILTER, query: '  叶 ' })).toBe(false);
  });
});

describe('folioRiskLevels', () => {
  it('每叶取最高等级，项目级风险不计入', () => {
    const m = folioRiskLevels(report().risks);
    expect(m.get('f2')).toBe('high');
    expect(m.get('f3')).toBe('medium');
    expect(m.has('f1')).toBe(false);
  });
});

describe('filterFolios', () => {
  const r = report();

  it('默认条件返回全部叶，且保持报告原顺序（叶序）', () => {
    expect(filterFolios(r.folios, r.risks, DEFAULT_FILTER).map((f) => f.folio_id)).toEqual(['f1', 'f2', 'f3']);
  });

  it('按阶段筛选', () => {
    const got = filterFolios(r.folios, r.risks, { ...DEFAULT_FILTER, stage: 'annotated' });
    expect(got.map((f) => f.folio_id)).toEqual(['f2']);
  });

  it('按风险等级筛选：只留该叶最高等级匹配者', () => {
    const high = filterFolios(r.folios, r.risks, { ...DEFAULT_FILTER, risk: 'high' });
    expect(high.map((f) => f.folio_id)).toEqual(['f2']);
    const medium = filterFolios(r.folios, r.risks, { ...DEFAULT_FILTER, risk: 'medium' });
    expect(medium.map((f) => f.folio_id)).toEqual(['f3']);
  });

  it('按叶名称筛选，大小写不敏感', () => {
    const got = filterFolios(r.folios, r.risks, { ...DEFAULT_FILTER, query: '虫蛀' });
    expect(got.map((f) => f.folio_id)).toEqual(['f3']);
  });

  it('三维度同时生效（AND）', () => {
    const got = filterFolios(r.folios, r.risks, { stage: 'annotated', risk: 'high', query: '第二' });
    expect(got.map((f) => f.folio_id)).toEqual(['f2']);
    expect(filterFolios(r.folios, r.risks, { stage: 'annotated', risk: 'high', query: '第三' })).toHaveLength(0);
  });

  it('排序：按叶名升/降序；按阶段升/降序，并以叶序稳定次序', () => {
    const nameAsc = filterFolios(r.folios, r.risks, DEFAULT_FILTER, { key: 'name', asc: true }).map((f) => f.name);
    // 中文拼音排序环境可用时：卷首序(juǎn)、卷一·第二叶、卷一·第三叶（“第”之前卷一二者前缀相同，二在前）
    expect(nameAsc[0]).toBe('卷首序');
    const nameDesc = filterFolios(r.folios, r.risks, DEFAULT_FILTER, { key: 'name', asc: false });
    expect(nameDesc[0].folio_id).toBe('f3');
    const stageDesc = filterFolios(r.folios, r.risks, DEFAULT_FILTER, { key: 'stage', asc: false });
    expect(stageDesc.map((f) => f.folio_id)).toEqual(['f3', 'f2', 'f1']);
    const stageAsc = filterFolios(r.folios, r.risks, DEFAULT_FILTER, { key: 'stage', asc: true });
    expect(stageAsc.map((f) => f.folio_id)).toEqual(['f1', 'f2', 'f3']);
  });

  it('排序不应修改输入数组', () => {
    const src = r.folios;
    filterFolios(src, r.risks, DEFAULT_FILTER, { key: 'name', asc: false });
    expect(src.map((f) => f.folio_id)).toEqual(['f1', 'f2', 'f3']);
  });
});

describe('filterRisks', () => {
  const r = report();

  it('默认按等级高→低排序，并保留 folio_id 供跳转', () => {
    const got = filterRisks(r.risks, r.folios, DEFAULT_FILTER);
    expect(got.map((x) => x.level)).toEqual(['high', 'high', 'medium', 'medium', 'low']);
    expect(got[0].folio_id).toBe('f2');
  });

  it('按风险等级筛选', () => {
    const high = filterRisks(r.risks, r.folios, { ...DEFAULT_FILTER, risk: 'high' });
    expect(high.map((x) => x.code)).toEqual(['damage-without-plan', 'high-risk-technique']);
  });

  it('阶段筛选只留关联叶处于该阶段的风险，项目级风险被排除', () => {
    const annotated = filterRisks(r.risks, r.folios, { ...DEFAULT_FILTER, stage: 'annotated' });
    expect(annotated.map((x) => x.code).sort()).toEqual(['damage-without-plan', 'no-steps']);
    const treated = filterRisks(r.risks, r.folios, { ...DEFAULT_FILTER, stage: 'treated' });
    expect(treated.map((x) => x.code)).toEqual(['missing-after-image']);
  });

  it('叶名称关键词只匹配绑定到匹配叶的风险', () => {
    const got = filterRisks(r.risks, r.folios, { ...DEFAULT_FILTER, query: '虫蛀' });
    expect(got.map((x) => x.code)).toEqual(['missing-after-image']);
  });

  it('等级筛选不影响项目级风险；名称/阶段筛选会排除项目级风险', () => {
    const low = filterRisks(r.risks, r.folios, { ...DEFAULT_FILTER, risk: 'low' });
    expect(low.map((x) => x.code)).toEqual(['stale-project']);
    const byName = filterRisks(r.risks, r.folios, { ...DEFAULT_FILTER, query: '卷' });
    expect(byName.every((x) => x.folio_id !== null)).toBe(true);
  });

  it('按名称/阶段排序时项目级风险沉底', () => {
    const byName = filterRisks(r.risks, r.folios, DEFAULT_FILTER, { key: 'name', asc: true });
    expect(byName.slice(0, 3).every((x) => x.folio_id !== null)).toBe(true);
    expect(byName.slice(3).map((x) => x.code).sort()).toEqual(['high-risk-technique', 'stale-project']);
  });
});

describe('queryDashboard', () => {
  it('两张清单共用同一筛选条件一次返回', () => {
    const q = queryDashboard(report(), { stage: 'annotated', risk: 'all', query: '' }, DEFAULT_SORT);
    expect(q.folios.map((f) => f.folio_id)).toEqual(['f2']);
    expect(q.risks.map((x) => x.code).sort()).toEqual(['damage-without-plan', 'no-steps']);
  });
});
