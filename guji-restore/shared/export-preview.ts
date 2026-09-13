import type {
  Comment,
  ExportRecord,
  Folio,
  ID,
  Layer,
  PlanVersion,
  Project,
  RestorationStep,
  Shape
} from './types.js';
import { currentPlanIsSaved } from './plan-saved.js';

/**
 * 导出预览：生成档案前的纯函数汇总（与 buildDashboard 一样不做任何落库/IO）。
 * 汇总项目基本信息、扫描叶、标注、修复方案、工序、批注状态、前后对比图与校验清单，
 * 并明确标出归档风险：
 *   - missing-after-image  已施作但缺修复后图
 *   - unresolved-comments   存在未解决批注
 *   - plan-not-versioned    标注/方案改动后尚未另存版本
 * 主进程（含真实文件校验）与浏览器 Mock 共用本模块，保证两端口径一致。
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export type ExportRiskCode =
  | 'missing-after-image'
  | 'unresolved-comments'
  | 'plan-not-versioned';

export interface ExportRisk {
  code: ExportRiskCode;
  title: string;
  detail: string;
  /** 关联叶（项目级风险为 null） */
  folio_id: ID | null;
}

/** 校验清单条目（fail 会阻止导出，warn 需用户确认后继续） */
export interface ExportCheckItem {
  code: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

/** 前后对比图就绪情况（预览中逐叶列出） */
export interface ExportFolioSummary {
  folio_id: ID;
  name: string;
  sequence: number;
  hasOriginal: boolean;
  hasAfter: boolean;
  hasThumb: boolean;
  damageCount: number;
  repairCount: number;
  stepCount: number;
  /** 原始 sha256 与实测字节是否一致（未知时为 null，例如浏览器 Mock 无文件访问） */
  originalMatched: boolean | null;
  /** 当前图层/标注方案是否已另存为版本（与任一版本快照一致；存版后再改动则为 false） */
  planSaved: boolean;
  /** 是否曾经人工存过版（仅用于区分“从未存版”与“存版后又改动”两种文案） */
  hasManualVersion: boolean;
}

export interface ExportPreview {
  generated_at: string;
  project_id: ID;
  project: {
    name: string;
    author: string;
    shelf_no: string;
    era: string;
    description: string;
    created_at: string;
    updated_at: string;
  };
  counts: {
    folios: number;
    shapes: number;
    damageShapes: number;
    repairShapes: number;
    steps: number;
    comments: number;
    unresolvedComments: number;
    resolvedComments: number;
    afterImages: number;
    versions: number;
    manualVersions: number;
  };
  /** 前后对比图逐叶情况 */
  folios: ExportFolioSummary[];
  /** 最近的导出记录（成功/失败），便于失败后重新导出 */
  records: ExportRecord[];
  /** 归档风险（仅三类归档阻断性提示；看板其余软性风险不阻断归档） */
  risks: ExportRisk[];
  /** 归档前校验清单 */
  checklist: ExportCheckItem[];
  /** 是否存在阻止导出的硬性问题（清单中含 fail） */
  canExport: boolean;
  /** 是否存在需要用户确认的风险/提示 */
  hasWarnings: boolean;
}

export interface ExportPreviewInput {
  project: Project;
  folios: Folio[];
  layers: Layer[];
  shapes: Shape[];
  steps: RestorationStep[];
  comments: Comment[];
  versions: PlanVersion[];
  records?: ExportRecord[];
  /**
   * 真实文件校验：rel 相对项目目录 -> 文件是否存在。
   * 主进程注入磁盘结果；浏览器 Mock 无文件访问时省略，相关项判 warn 而非 fail。
   */
  mediaExists?: Map<string, boolean>;
  /** 主进程注入：folioId -> 原图实测 sha256 是否与入库值一致 */
  checksumMatched?: Map<ID, boolean>;
  now?: Date;
}

export function buildExportPreview(input: ExportPreviewInput): ExportPreview {
  const now = (input.now ?? new Date()).toISOString();
  const layerKind = new Map(input.layers.map((l) => [l.id, l.kind]));
  const exists = (rel: string | null | undefined): boolean | null => {
    if (!rel) return false;
    if (!input.mediaExists) return null;
    return input.mediaExists.get(rel) ?? false;
  };

  const sortedFolios = [...input.folios].sort(
    (a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name)
  );

  const stepsOf = (folioId: ID) => input.steps.filter((s) => s.folio_id === folioId);
  const versionsOf = (folioId: ID) => input.versions.filter((v) => v.folio_id === folioId);

  const folioSummaries: ExportFolioSummary[] = sortedFolios.map((f) => {
    const fLayers = input.layers.filter((l) => l.folio_id === f.id);
    const fShapes = input.shapes.filter((s) => s.folio_id === f.id);
    const fVersions = versionsOf(f.id);
    return {
      folio_id: f.id,
      name: f.name,
      sequence: f.sequence,
      hasOriginal: exists(f.original_rel) ?? true,
      hasAfter: !!f.after_rel && exists(f.after_rel) !== false,
      hasThumb: exists(f.thumb_rel) ?? true,
      damageCount: fShapes.filter((s) => layerKind.get(s.layer_id) === 'damage').length,
      repairCount: fShapes.filter((s) => layerKind.get(s.layer_id) === 'repair').length,
      stepCount: stepsOf(f.id).length,
      originalMatched: input.checksumMatched ? (input.checksumMatched.get(f.id) ?? false) : null,
      planSaved: currentPlanIsSaved({ layers: fLayers, shapes: fShapes }, fVersions),
      hasManualVersion: fVersions.some((v) => v.author !== 'system')
    };
  });

  /* ---------- 汇总计数 ---------- */

  const folioIds = new Set(sortedFolios.map((f) => f.id));
  const projectShapes = input.shapes.filter((s) => folioIds.has(s.folio_id));
  const damageShapes = projectShapes.filter((s) => layerKind.get(s.layer_id) === 'damage');
  const repairShapes = projectShapes.filter((s) => layerKind.get(s.layer_id) === 'repair');
  const unresolvedComments = input.comments.filter((c) => !c.resolved);
  const afterImages = folioSummaries.filter((f) => f.hasAfter).length;
  const manualVersions = input.versions.filter((v) => v.author !== 'system').length;

  const counts = {
    folios: sortedFolios.length,
    shapes: projectShapes.length,
    damageShapes: damageShapes.length,
    repairShapes: repairShapes.length,
    steps: input.steps.length,
    comments: input.comments.length,
    unresolvedComments: unresolvedComments.length,
    resolvedComments: input.comments.length - unresolvedComments.length,
    afterImages,
    versions: input.versions.length,
    manualVersions
  };

  /* ---------- 归档风险（三类明确标出） ---------- */

  const risks: ExportRisk[] = [];

  for (const f of folioSummaries) {
    // 缺修复后图：已经施作（有工序）却没有修复后对照图
    if (f.stepCount > 0 && !f.hasAfter) {
      risks.push({
        code: 'missing-after-image',
        title: '缺修复后对照图',
        detail: `「${f.name}」已登记 ${f.stepCount} 道工序，尚未导入修复后对照图，档案将只有修复前影像。`,
        folio_id: f.folio_id
      });
    }
    // 未保存方案：当前图层/标注与任何已存版本快照都不一致（存版后又改动也算未保存）
    if ((f.damageCount > 0 || f.repairCount > 0) && !f.planSaved) {
      const suffix = f.hasManualVersion
        ? '最近一次存版后已有改动，归档后无法回退到当前方案。'
        : '尚未另存版本，归档后无法回退到本方案。';
      risks.push({
        code: 'plan-not-versioned',
        title: '修补方案未保存版本',
        detail: `「${f.name}」当前有 ${f.damageCount + f.repairCount} 处标注/方案，${suffix}`,
        folio_id: f.folio_id
      });
    }
  }

  if (unresolvedComments.length > 0) {
    risks.push({
      code: 'unresolved-comments',
      title: '存在未解决批注',
      detail: `有 ${unresolvedComments.length} 条批注仍标记为“待处理”，归档前应逐条确认闭环。`,
      folio_id: null
    });
  }

  /* ---------- 校验清单 ---------- */

  const checklist: ExportCheckItem[] = [];
  const push = (code: string, label: string, status: CheckStatus, detail: string) =>
    checklist.push({ code, label, status, detail });

  // 1) 项目基本信息
  const missingMeta = (['name'] as const).filter((k) => !input.project[k]?.trim());
  push(
    'project-info',
    '项目基本信息',
    missingMeta.length ? 'fail' : 'pass',
    missingMeta.length ? '项目名称缺失，无法生成档案。' : '名称、馆藏号、年代、建档人已记录。'
  );

  // 2) 扫描叶
  push(
    'folios',
    '扫描叶',
    counts.folios > 0 ? 'pass' : 'fail',
    counts.folios > 0 ? `共 ${counts.folios} 叶扫描。` : '项目尚未导入任何扫描叶，没有可归档内容。'
  );

  // 3) 原图只读副本与校验
  const missingOriginal = folioSummaries.filter((f) => !f.hasOriginal);
  const mismatched = folioSummaries.filter((f) => f.originalMatched === false);
  push(
    'original-readonly',
    '原图只读副本',
    missingOriginal.length || mismatched.length
      ? 'fail'
      : input.checksumMatched
        ? 'pass'
        : 'warn',
    missingOriginal.length
      ? `${missingOriginal.length} 叶的原图副本丢失：${missingOriginal.map((f) => f.name).join('、')}。`
      : mismatched.length
        ? `${mismatched.length} 叶原图 sha256 与入库记录不一致：${mismatched.map((f) => f.name).join('、')}。`
        : input.checksumMatched
          ? `${counts.folios} 叶原图均可读且 sha256 与入库记录一致。`
          : '浏览器环境未做磁盘校验；Electron 导出时会逐叶比对 sha256。'
  );

  // 4) 缩略图
  const missingThumb = folioSummaries.filter((f) => !f.hasThumb);
  push(
    'thumbnails',
    '缩略图',
    missingThumb.length ? 'fail' : 'pass',
    missingThumb.length
      ? `${missingThumb.length} 叶缩略图缺失：${missingThumb.map((f) => f.name).join('、')}。`
      : '各叶缩略图齐备。'
  );

  // 5) 破损标注
  push(
    'damage-shapes',
    '破损标注',
    counts.damageShapes > 0 ? 'pass' : 'warn',
    counts.damageShapes > 0 ? `共 ${counts.damageShapes} 处破损标注。` : '尚无破损标注，档案将不含破损分布。'
  );

  // 6) 修复方案（修补层标注）
  push(
    'repair-shapes',
    '修复方案',
    counts.repairShapes > 0 ? 'pass' : 'warn',
    counts.repairShapes > 0
      ? `共 ${counts.repairShapes} 处修补方案标注。`
      : '修补层尚无方案标注（破损将无对应处理记录）。'
  );

  // 7) 工序记录
  push(
    'steps',
    '修复工序',
    counts.steps > 0 ? 'pass' : 'warn',
    counts.steps > 0 ? `共 ${counts.steps} 道工序记录。` : '尚未登记任何修复工序。'
  );

  // 8) 方案版本
  const unsaved = risks.filter((r) => r.code === 'plan-not-versioned');
  const unsavedFolios = new Set(unsaved.map((r) => r.folio_id));
  const changedAfterSave = folioSummaries.filter(
    (f) => unsavedFolios.has(f.folio_id) && f.hasManualVersion
  ).length;
  const neverSaved = unsaved.length - changedAfterSave;
  push(
    'plan-versions',
    '方案已保存版本',
    unsaved.length ? 'warn' : 'pass',
    unsaved.length
      ? [
          neverSaved > 0 ? `${neverSaved} 叶从未存版` : '',
          changedAfterSave > 0 ? `${changedAfterSave} 叶存版后又有改动` : ''
        ]
          .filter(Boolean)
          .join('；') + '（详见风险）。'
      : manualVersions > 0
        ? `当前方案与已存版本一致（共 ${manualVersions} 个人工版本）。`
        : '暂无标注，无需存版。'
  );

  // 9) 批注闭环
  push(
    'comments',
    '批注全部闭环',
    unresolvedComments.length ? 'warn' : 'pass',
    unresolvedComments.length
      ? `${unresolvedComments.length} 条未解决 / ${input.comments.length} 条总计。`
      : input.comments.length
        ? `${input.comments.length} 条批注均已解决。`
        : '暂无批注。'
  );

  // 10) 修复后对照图
  const missingAfter = risks.filter((r) => r.code === 'missing-after-image');
  push(
    'after-images',
    '修复前后对比图',
    missingAfter.length ? 'warn' : 'pass',
    counts.folios === 0
      ? '暂无扫描叶。'
      : afterImages === 0
        ? '没有任何修复后对照图。'
        : `${afterImages}/${counts.folios} 叶有修复后图` +
          (missingAfter.length ? `；其中 ${missingAfter.length} 叶已施作但仍缺图（详见风险）。` : '。')
  );

  // 11) 校验清单（zip 内 checksums.txt）
  push(
    'checksums',
    '校验清单',
    'pass',
    '导出时为全部媒体与 manifest.json 计算 sha256，写入 checksums.txt（原图始终登记、随选项决定是否打包）。'
  );

  const canExport = !checklist.some((c) => c.status === 'fail');
  const hasWarnings = checklist.some((c) => c.status === 'warn') || risks.length > 0;

  return {
    generated_at: now,
    project_id: input.project.id,
    project: {
      name: input.project.name,
      author: input.project.author,
      shelf_no: input.project.shelf_no,
      era: input.project.era,
      description: input.project.description,
      created_at: input.project.created_at,
      updated_at: input.project.updated_at
    },
    counts,
    folios: folioSummaries,
    records: input.records ?? [],
    risks,
    checklist,
    canExport,
    hasWarnings
  };
}
