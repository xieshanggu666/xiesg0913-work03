import { describe, expect, it } from 'vitest';
import { buildDashboard, STAGE_ORDER, type DashboardInput } from '@shared/dashboard';
import type { Comment, Folio, Layer, PlanVersion, Project, RestorationStep, Shape } from '@shared/types';

/**
 * 看板纯函数测试：阶段流水线、总进度、风险规则。
 * 夹具构造一个三叶项目，覆盖「导入→标注→立项→施作→对比」全链路。
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

function makeFolio(id: string, sequence: number, hasAfter = false): Folio {
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

function makeLayers(folioId: string): Layer[] {
  return (['damage', 'repair', 'note'] as const).map((kind, i) => ({
    id: `lay_${folioId}_${kind}`,
    folio_id: folioId,
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

function makeShape(id: string, folioId: string, kind: 'damage' | 'repair', damage: Shape['damage'], area = 100): Shape {
  return {
    id,
    folio_id: folioId,
    layer_id: `lay_${folioId}_${kind}`,
    damage,
    geometry: { type: 'rect', x: 0, y: 0, w: 10, h: 10 },
    label: '',
    note: '',
    area_px: area,
    order_index: 1,
    created_at: '2026-09-10T08:00:00.000Z'
  };
}

function makeStep(id: string, folioId: string | null, overrides: Partial<RestorationStep> = {}): RestorationStep {
  return {
    id,
    project_id: project.id,
    folio_id: folioId,
    order_index: 1,
    title: '工序',
    technique: '补洞',
    material_ids: ['mat_1'],
    operator: '测试员',
    performed_at: '2026-09-11',
    duration_min: 30,
    photo_rel: null,
    note: '',
    created_at: '2026-09-11T08:00:00.000Z',
    ...overrides
  };
}

function makeComment(id: string, resolved: boolean): Comment {
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

function makeVersion(
  folioId: string,
  author: string,
  snapshot: { layers: Layer[]; shapes: Shape[] } = { layers: [], shapes: [] }
): PlanVersion {
  return {
    id: `ver_${folioId}_${author}`,
    project_id: project.id,
    folio_id: folioId,
    version: 1,
    label: author === 'system' ? '建档基线' : '手工存版',
    note: '',
    author,
    snapshot,
    created_at: '2026-09-10T08:00:00.000Z'
  };
}

/** 三叶：f1 全链路（对比完成），f2 仅标注+方案，f3 仅导入 */
function fixture(): DashboardInput {
  const folios = [makeFolio('f1', 1, true), makeFolio('f2', 2), makeFolio('f3', 3)];
  const layers = folios.flatMap((f) => makeLayers(f.id));
  const shapes = [
    makeShape('s1', 'f1', 'damage', 'wormhole', 200),
    makeShape('s2', 'f1', 'damage', 'tear', 100),
    makeShape('s3', 'f1', 'repair', 'wormhole'),
    makeShape('s4', 'f2', 'damage', 'mildew', 300),
    makeShape('s5', 'f2', 'repair', 'mildew')
  ];
  const steps = [makeStep('st1', 'f1'), makeStep('st2', 'f1', { technique: '脱酸', material_ids: [] })];
  const comments = [makeComment('c1', false), makeComment('c2', true)];
  // f1 的人工版本快照与当前方案一致 → 已存版；f2 只有 system 基线 → 未存版
  const f1Snapshot = {
    layers: layers.filter((l) => l.folio_id === 'f1'),
    shapes: shapes.filter((s) => s.folio_id === 'f1')
  };
  const versions = [
    makeVersion('f1', 'system'),
    makeVersion('f1', '修复师', f1Snapshot),
    makeVersion('f2', 'system')
  ];
  return { project, folios, layers, shapes, steps, comments, versions, now: NOW };
}

describe('项目进度与风险看板', () => {
  it('空项目：进度 0，无风险', () => {
    const r = buildDashboard({ project, folios: [], layers: [], shapes: [], steps: [], comments: [], versions: [], now: NOW });
    expect(r.completion).toBe(0);
    expect(r.risks).toEqual([]);
    expect(STAGE_ORDER.every((s) => r.stageReached[s] === 0)).toBe(true);
  });

  it('按叶推导最远阶段并形成单调漏斗', () => {
    const r = buildDashboard(fixture());
    const byId = Object.fromEntries(r.folios.map((f) => [f.folio_id, f.stage]));
    expect(byId).toEqual({ f1: 'compared', f2: 'planned', f3: 'imported' });
    // 漏斗：3 叶都导入；2 叶有标注；2 叶有方案；1 叶施作；1 叶对比
    expect(r.stageReached).toEqual({ imported: 3, annotated: 2, planned: 2, treated: 1, compared: 1 });
    // 总进度 = (4 + 2 + 0) / (3 × 4) = 50%
    expect(r.completion).toBe(50);
  });

  it('汇总与破损构成只统计破损层标注', () => {
    const r = buildDashboard(fixture());
    expect(r.totals.damageShapes).toBe(3);
    expect(r.totals.repairShapes).toBe(2);
    expect(r.totals.damagedAreaPx).toBe(600);
    expect(r.totals.unresolvedComments).toBe(1);
    const kinds = Object.fromEntries(r.damageByKind.map((d) => [d.kind, d.count]));
    expect(kinds).toEqual({ wormhole: 1, tear: 1, mildew: 1 });
  });

  it('风险：重度破损/未施作/缺对照图/高风险工艺/未闭环批注/未登记用材', () => {
    const r = buildDashboard(fixture());
    const byCode = new Map(r.risks.map((x) => [x.code, x]));
    // f2 有霉变 → 重度破损（中）
    expect(byCode.get('severe-damage')?.level).toBe('medium');
    expect(byCode.get('severe-damage')?.folio_id).toBe('f2');
    // f2 有方案无工序 → 未见工序记录（中）
    expect(byCode.get('no-steps')?.folio_id).toBe('f2');
    // f1 有对照图 → 不触发 missing-after-image
    expect(byCode.has('missing-after-image')).toBe(false);
    // 脱酸 → 高风险工艺（高）
    expect(byCode.get('high-risk-technique')?.level).toBe('high');
    expect(byCode.get('high-risk-technique')?.detail).toContain('脱酸');
    // 1 条未解决批注 → 中
    expect(byCode.get('unresolved-comments')?.level).toBe('medium');
    // 1 道工序未登记用材 → 低
    expect(byCode.get('step-without-material')?.level).toBe('low');
    // f2 有标注但只有 system 基线版 → 方案未存版（低）；f1 人工版本快照与当前一致 → 不触发
    expect(byCode.get('plan-not-versioned')?.folio_id).toBe('f2');
    // 排序：高风险在前
    expect(r.risks[0].level).toBe('high');
  });

  it('风险：有破损无方案 → 高风险；破损消失后规则解除', () => {
    const input = fixture();
    input.shapes = input.shapes.filter((s) => !(s.folio_id === 'f2' && s.layer_id.includes('repair')));
    const r = buildDashboard(input);
    const hit = r.risks.find((x) => x.code === 'damage-without-plan');
    expect(hit?.level).toBe('high');
    expect(hit?.folio_id).toBe('f2');
    // 补上方案后规则解除
    const fixed = buildDashboard(fixture());
    expect(fixed.risks.some((x) => x.code === 'damage-without-plan')).toBe(false);
  });

  it('风险：未解决批注 ≥5 条升为高风险', () => {
    const input = fixture();
    input.comments = Array.from({ length: 5 }, (_, i) => makeComment(`c${i}`, false));
    const r = buildDashboard(input);
    expect(r.risks.find((x) => x.code === 'unresolved-comments')?.level).toBe('high');
  });

  it('回归：曾存版但之后又改动，仍须提示方案未存版', () => {
    const input = fixture();
    // f1 的人工版本快照只有 s1：当前还多了 s2/s3（存版后的改动）→ 快照不一致
    const staleVersion = makeVersion('f1', '修复师', {
      layers: input.layers.filter((l) => l.folio_id === 'f1'),
      shapes: [input.shapes.find((s) => s.id === 's1')!]
    });
    input.versions = input.versions.filter((v) => !(v.folio_id === 'f1' && v.author === '修复师'));
    input.versions.push(staleVersion);
    const r = buildDashboard(input);
    const hits = r.risks.filter((x) => x.code === 'plan-not-versioned').map((x) => x.folio_id);
    expect(hits).toContain('f1');
    expect(hits).toContain('f2');

    // 补存与当前一致的版本后规则对 f1 解除
    const reSaved = buildDashboard(fixture());
    expect(
      reSaved.risks
        .filter((x) => x.code === 'plan-not-versioned')
        .map((x) => x.folio_id)
    ).toEqual(['f2']);
  });

  it('回退到历史版本后当前与快照一致 → 不提示未存版', () => {
    const input = fixture();
    // 假设当前只剩 s1（回退到旧状态），而某历史版本快照正好也是 s1
    input.shapes = input.shapes.filter((s) => s.id !== 's2' && s.id !== 's3');
    const old = makeVersion('f1', '修复师', {
      layers: input.layers.filter((l) => l.folio_id === 'f1'),
      shapes: input.shapes.filter((s) => s.folio_id === 'f1')
    });
    input.versions = input.versions.filter((v) => !(v.folio_id === 'f1' && v.author === '修复师'));
    input.versions.push(old);
    const r = buildDashboard(input);
    expect(r.risks.filter((x) => x.code === 'plan-not-versioned' && x.folio_id === 'f1')).toHaveLength(0);
  });

  it('回归：对照图不能跳过前置流程（阶段必须连续推进）', () => {
    const base: DashboardInput = {
      project,
      folios: [makeFolio('f9', 1, true)], // 有修复后对照图
      layers: makeLayers('f9'),
      shapes: [],
      steps: [],
      comments: [],
      versions: [],
      now: NOW
    };
    // 只有对照图、无标注/方案/工序 → 仍为“已导入”，漏斗与总进度不被抬高
    const only = buildDashboard(base);
    expect(only.folios[0].stage).toBe('imported');
    expect(only.completion).toBe(0);
    expect(only.stageReached).toEqual({ imported: 1, annotated: 0, planned: 0, treated: 0, compared: 0 });

    // 有标注 + 对照图，但无方案/工序 → 止步“已标注”
    const partial = buildDashboard({ ...base, shapes: [makeShape('sx1', 'f9', 'damage', 'tear')] });
    expect(partial.folios[0].stage).toBe('annotated');
    expect(partial.stageReached).toEqual({ imported: 1, annotated: 1, planned: 0, treated: 0, compared: 0 });

    // 有标注 + 方案 + 对照图，但无工序 → 止步“已立项”
    const noSteps = buildDashboard({
      ...base,
      shapes: [makeShape('sx1', 'f9', 'damage', 'tear'), makeShape('sx2', 'f9', 'repair', 'tear')]
    });
    expect(noSteps.folios[0].stage).toBe('planned');

    // 补全工序后 → 才到达“已对比”
    const full = buildDashboard({
      ...base,
      shapes: [makeShape('sx1', 'f9', 'damage', 'tear'), makeShape('sx2', 'f9', 'repair', 'tear')],
      steps: [makeStep('st9', 'f9')]
    });
    expect(full.folios[0].stage).toBe('compared');
    expect(full.completion).toBe(100);
  });

  it('风险：停滞以项目内最新活动为准（批注/工序/标注都算活动）', () => {
    const old = '2026-07-01T08:00:00.000Z';
    const staleInput: DashboardInput = {
      project: { ...project, updated_at: old },
      folios: [{ ...makeFolio('f1', 1), imported_at: old }],
      layers: makeLayers('f1'),
      shapes: [{ ...makeShape('s1', 'f1', 'damage', 'tear'), created_at: old }],
      steps: [],
      comments: [],
      versions: [],
      now: NOW
    };
    // 全部活动都超过 30 天 → 报停滞
    const r = buildDashboard(staleInput);
    expect(r.risks.find((x) => x.code === 'stale-project')?.level).toBe('low');

    // 项目元数据虽旧，但昨天刚加了批注 → 不误报（回归：批注要计入活动时间）
    const withComment = buildDashboard({
      ...staleInput,
      comments: [{ ...makeComment('c1', false), created_at: '2026-09-11T08:00:00.000Z' }]
    });
    expect(withComment.risks.some((x) => x.code === 'stale-project')).toBe(false);

    // 昨天刚记了工序 → 同样不误报
    const withStep = buildDashboard({
      ...staleInput,
      steps: [{ ...makeStep('st1', 'f1'), created_at: '2026-09-11T08:00:00.000Z' }]
    });
    expect(withStep.risks.some((x) => x.code === 'stale-project')).toBe(false);

    // 全部完工（走完完整流水线，completion 100）则不提示
    const done = buildDashboard({
      ...staleInput,
      folios: [{ ...makeFolio('f9', 1, true), imported_at: old }],
      layers: makeLayers('f9'),
      shapes: [
        { ...makeShape('sx1', 'f9', 'damage', 'tear'), created_at: old },
        { ...makeShape('sx2', 'f9', 'repair', 'tear'), created_at: old }
      ],
      steps: [{ ...makeStep('st9', 'f9'), created_at: old }]
    });
    expect(done.completion).toBe(100);
    expect(done.risks.some((x) => x.code === 'stale-project')).toBe(false);
  });
});
