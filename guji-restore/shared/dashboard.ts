import type {
  Comment,
  DamageKind,
  Folio,
  ID,
  Layer,
  PlanVersion,
  Project,
  RestorationStep,
  Shape
} from './types.js';
import { DAMAGE_META } from './constants.js';

/**
 * 项目进度与风险看板：纯函数推导，不新增任何存储。
 * 进度 = 每叶沿「导入 → 标注 → 立项 → 施作 → 对比」流水线**连续**到达的最远阶段
 * （后续阶段不得跳过前置流程：例如仅有修复后对照图的叶仍记为“已导入”）；
 * 风险 = 一组可解释规则（未立方案、批注未闭环、高风险工艺……），逐条给出理由。
 * 主进程（SQLite 聚合）与浏览器 Mock 共用本模块，保证两端口径一致。
 */

export type FolioStage = 'imported' | 'annotated' | 'planned' | 'treated' | 'compared';

export const STAGE_ORDER: FolioStage[] = ['imported', 'annotated', 'planned', 'treated', 'compared'];

export const STAGE_META: Record<FolioStage, { label: string; hint: string }> = {
  imported: { label: '已导入', hint: '扫描已入库，原图只读' },
  annotated: { label: '已标注', hint: '破损层已有标注' },
  planned: { label: '已立项', hint: '修补层已有方案' },
  treated: { label: '已施作', hint: '已登记修复工序' },
  compared: { label: '已对比', hint: '已导入修复后对照图' }
};

/** 高风险工艺：按修复伦理须复核留痕（见 README「修复伦理约束」：清洗、脱酸、接笔及全色） */
export const HIGH_RISK_TECHNIQUES = ['淋洗', '湿揭', '脱酸', '全色', '接笔'] as const;

/** 会扩散或需优先处理的重度破损类型 */
export const SEVERE_DAMAGE_KINDS: DamageKind[] = ['mildew', 'missing'];

/** 项目超过该天数未更新且未完工时提示 */
export const STALE_DAYS = 30;

export type RiskLevel = 'high' | 'medium' | 'low';

export interface RiskItem {
  level: RiskLevel;
  /** 稳定代码，便于测试与将来做规则开关 */
  code: string;
  title: string;
  detail: string;
  /** 关联叶（可跳转标注页）；项目级风险为 null */
  folio_id: ID | null;
}

export interface FolioProgress {
  folio_id: ID;
  name: string;
  sequence: number;
  stage: FolioStage;
  damageCount: number;
  repairCount: number;
  stepCount: number;
  hasAfter: boolean;
  damagedAreaPx: number;
}

export interface DashboardTotals {
  folios: number;
  damageShapes: number;
  repairShapes: number;
  steps: number;
  comments: number;
  unresolvedComments: number;
  afterImages: number;
  versions: number;
  damagedAreaPx: number;
}

export interface DashboardReport {
  generated_at: string;
  project_id: ID;
  /** 0..100，全部叶阶段进度的均值 */
  completion: number;
  totals: DashboardTotals;
  /** 各阶段“已到达”叶数（累计漏斗，单调不增） */
  stageReached: Record<FolioStage, number>;
  damageByKind: { kind: DamageKind; label: string; count: number; areaPx: number }[];
  techniqueCounts: { technique: string; count: number }[];
  risks: RiskItem[];
  folios: FolioProgress[];
}

export interface DashboardInput {
  project: Project;
  folios: Folio[];
  layers: Layer[];
  shapes: Shape[];
  steps: RestorationStep[];
  comments: Comment[];
  versions: PlanVersion[];
  /** 注入“当前时间”便于测试；默认真实当前时间 */
  now?: Date;
}

const LEVEL_ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

export function buildDashboard(input: DashboardInput): DashboardReport {
  const now = input.now ?? new Date();
  const layerKind = new Map(input.layers.map((l) => [l.id, l.kind]));
  const folioIds = new Set(input.folios.map((f) => f.id));

  const shapesOf = (folioId: ID, kind: 'damage' | 'repair') =>
    input.shapes.filter((s) => s.folio_id === folioId && layerKind.get(s.layer_id) === kind);
  const stepsOf = (folioId: ID) => input.steps.filter((s) => s.folio_id === folioId);
  const versionsOf = (folioId: ID) => input.versions.filter((v) => v.folio_id === folioId);
  /** 每叶的破损层标注，进度与风险规则共用 */
  const damageByFolio = new Map<ID, Shape[]>();

  /* ---------- 分叶进度 ---------- */

  const folioProgress: FolioProgress[] = [...input.folios]
    .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name))
    .map((f) => {
      const damage = shapesOf(f.id, 'damage');
      damageByFolio.set(f.id, damage);
      const repair = shapesOf(f.id, 'repair');
      const steps = stepsOf(f.id);
      const hasAfter = !!f.after_rel;
      // 阶段必须沿流水线连续推进，不得跳过前置流程：
      // 只有修复后对照图、没有标注/方案/工序的叶，不能记为“已对比”
      let stage: FolioStage = 'imported';
      const gates: [FolioStage, boolean][] = [
        ['annotated', damage.length > 0],
        ['planned', repair.length > 0],
        ['treated', steps.length > 0],
        ['compared', hasAfter]
      ];
      for (const [s, ok] of gates) {
        if (!ok) break;
        stage = s;
      }
      return {
        folio_id: f.id,
        name: f.name,
        sequence: f.sequence,
        stage,
        damageCount: damage.length,
        repairCount: repair.length,
        stepCount: steps.length,
        hasAfter,
        damagedAreaPx: damage.reduce((a, s) => a + s.area_px, 0)
      };
    });

  const stageIndex = (s: FolioStage) => STAGE_ORDER.indexOf(s);
  const stageReached = Object.fromEntries(
    STAGE_ORDER.map((s, i) => [s, folioProgress.filter((f) => stageIndex(f.stage) >= i).length])
  ) as Record<FolioStage, number>;

  const lastStage = STAGE_ORDER.length - 1;
  const completion = folioProgress.length
    ? Math.round((100 * folioProgress.reduce((a, f) => a + stageIndex(f.stage), 0)) / (folioProgress.length * lastStage))
    : 0;

  /* ---------- 汇总 ---------- */

  const projectShapes = input.shapes.filter((s) => folioIds.has(s.folio_id));
  const damageShapes = projectShapes.filter((s) => layerKind.get(s.layer_id) === 'damage');
  const repairShapes = projectShapes.filter((s) => layerKind.get(s.layer_id) === 'repair');
  const unresolved = input.comments.filter((c) => !c.resolved);

  const totals: DashboardTotals = {
    folios: input.folios.length,
    damageShapes: damageShapes.length,
    repairShapes: repairShapes.length,
    steps: input.steps.length,
    comments: input.comments.length,
    unresolvedComments: unresolved.length,
    afterImages: input.folios.filter((f) => f.after_rel).length,
    versions: input.versions.length,
    damagedAreaPx: damageShapes.reduce((a, s) => a + s.area_px, 0)
  };

  const damageByKind = new Map<DamageKind, { count: number; areaPx: number }>();
  for (const s of damageShapes) {
    const cur = damageByKind.get(s.damage) ?? { count: 0, areaPx: 0 };
    cur.count += 1;
    cur.areaPx += s.area_px;
    damageByKind.set(s.damage, cur);
  }
  const damageList = [...damageByKind.entries()]
    .map(([kind, v]) => ({ kind, label: DAMAGE_META[kind]?.label ?? kind, count: v.count, areaPx: v.areaPx }))
    .sort((a, b) => b.count - a.count || b.areaPx - a.areaPx);

  const techMap = new Map<string, number>();
  for (const s of input.steps) {
    if (!s.technique) continue;
    techMap.set(s.technique, (techMap.get(s.technique) ?? 0) + 1);
  }
  const techniqueCounts = [...techMap.entries()]
    .map(([technique, count]) => ({ technique, count }))
    .sort((a, b) => b.count - a.count);

  /* ---------- 风险规则 ---------- */

  const risks: RiskItem[] = [];

  for (const fp of folioProgress) {
    if (fp.damageCount > 0 && fp.repairCount === 0) {
      risks.push({
        level: 'high',
        code: 'damage-without-plan',
        title: '破损未立修补方案',
        detail: `「${fp.name}」有 ${fp.damageCount} 处破损标注，修补层尚无对应方案。`,
        folio_id: fp.folio_id
      });
    }
    if ((fp.damageCount > 0 || fp.repairCount > 0) && fp.stepCount === 0) {
      risks.push({
        level: 'medium',
        code: 'no-steps',
        title: '未见工序记录',
        detail: `「${fp.name}」已有标注/方案，但尚未登记任何施作工序。`,
        folio_id: fp.folio_id
      });
    }
    if (fp.stepCount > 0 && !fp.hasAfter) {
      risks.push({
        level: 'medium',
        code: 'missing-after-image',
        title: '缺修复后对照图',
        detail: `「${fp.name}」已施作 ${fp.stepCount} 道工序，尚未导入修复后对照图。`,
        folio_id: fp.folio_id
      });
    }
    const severe = (damageByFolio.get(fp.folio_id) ?? []).filter((s) => SEVERE_DAMAGE_KINDS.includes(s.damage));
    if (severe.length > 0) {
      const kinds = [...new Set(severe.map((s) => DAMAGE_META[s.damage]?.label ?? s.damage))].join('、');
      risks.push({
        level: 'medium',
        code: 'severe-damage',
        title: '重度破损需优先',
        detail: `「${fp.name}」存在${kinds}类破损（${severe.length} 处），霉变会扩散、缺损易扩大，建议优先评估处理。`,
        folio_id: fp.folio_id
      });
    }
    const hasManualVersion = versionsOf(fp.folio_id).some((v) => v.author !== 'system');
    if ((fp.damageCount > 0 || fp.repairCount > 0) && !hasManualVersion) {
      risks.push({
        level: 'low',
        code: 'plan-not-versioned',
        title: '方案未存版',
        detail: `「${fp.name}」的标注方案尚未另存版本，误操作将不可回退。`,
        folio_id: fp.folio_id
      });
    }
  }

  const usedHighRisk = [...new Set(input.steps.map((s) => s.technique))].filter((t) =>
    (HIGH_RISK_TECHNIQUES as readonly string[]).includes(t)
  );
  if (usedHighRisk.length > 0) {
    const n = input.steps.filter((s) => (usedHighRisk as string[]).includes(s.technique)).length;
    risks.push({
      level: 'high',
      code: 'high-risk-technique',
      title: '含高风险工序',
      detail: `项目含高风险工艺（${usedHighRisk.join('、')}）共 ${n} 道，须按馆内规程复核并留痕。`,
      folio_id: null
    });
  }

  if (unresolved.length > 0) {
    risks.push({
      level: unresolved.length >= 5 ? 'high' : 'medium',
      code: 'unresolved-comments',
      title: '批注未闭环',
      detail: `有 ${unresolved.length} 条批注仍未解决，归档前需逐条确认闭环。`,
      folio_id: null
    });
  }

  const noMaterial = input.steps.filter((s) => s.material_ids.length === 0).length;
  if (noMaterial > 0) {
    risks.push({
      level: 'low',
      code: 'step-without-material',
      title: '工序未登记用材',
      detail: `${noMaterial} 道工序未关联材料，影响可逆性追溯。`,
      folio_id: null
    });
  }

  // 停滞判定以项目内可观测的最新活动为准：除 project.updated_at 外，
  // 批注/工序/标注/版本/扫描的创建时间也算活动（旧数据的这些操作可能从未写过 updated_at）
  const lastActivity = [
    input.project.updated_at,
    ...input.folios.map((f) => f.imported_at),
    ...input.shapes.map((s) => s.created_at),
    ...input.steps.map((s) => s.created_at),
    ...input.versions.map((v) => v.created_at),
    ...input.comments.map((c) => c.created_at)
  ]
    .map((t) => Date.parse(t))
    .reduce((a, b) => Math.max(a, b), 0);
  if (lastActivity > 0) {
    const days = Math.floor((now.getTime() - lastActivity) / 86_400_000);
    if (days > STALE_DAYS && completion < 100) {
      risks.push({
        level: 'low',
        code: 'stale-project',
        title: '项目久未更新',
        detail: `项目已 ${days} 天无新动态（批注/工序/标注/扫描），进度停留在 ${completion}%；若暂停修复请在档案中注明原因。`,
        folio_id: null
      });
    }
  }

  risks.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.code.localeCompare(b.code));

  return {
    generated_at: now.toISOString(),
    project_id: input.project.id,
    completion,
    totals,
    stageReached,
    damageByKind: damageList,
    techniqueCounts,
    risks,
    folios: folioProgress
  };
}
