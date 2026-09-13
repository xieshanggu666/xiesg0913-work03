/**
 * 看板的筛选与排序逻辑：阶段、风险等级、叶名称三个维度同时生效，
 * 分叶进度表与风险清单共用同一组筛选条件（纯函数，UI 只负责绑定状态）。
 */
import type { DashboardReport, FolioProgress, FolioStage, RiskItem, RiskLevel } from './dashboard.js';
import { STAGE_ORDER } from './dashboard.js';
import { compareByName } from './list-query.js';

export type StageFilter = FolioStage | 'all';
export type RiskFilter = RiskLevel | 'all';

export type DashboardSortKey = 'default' | 'name' | 'stage';

export interface DashboardFilter {
  stage: StageFilter;
  risk: RiskFilter;
  query: string;
}

export interface DashboardSort {
  key: DashboardSortKey;
  /** true = 升序（叶名 A→Z / 阶段早→晚 / 风险低→高），false = 降序 */
  asc: boolean;
}

export const DEFAULT_FILTER: DashboardFilter = { stage: 'all', risk: 'all', query: '' };
export const DEFAULT_SORT: DashboardSort = { key: 'default', asc: true };

export const RISK_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

const collator =
  typeof Intl !== 'undefined' && 'Collator' in Intl
    ? new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true })
    : null;

/** 名称排序：优先使用中文拼音/数字感知排序，不可用时退回 localeCompare */
export function compareFolioName(a: string, b: string): number {
  return collator ? collator.compare(a, b) : a.localeCompare(b);
}

export function isDefaultFilter(f: DashboardFilter): boolean {
  return f.stage === 'all' && f.risk === 'all' && f.query.trim() === '';
}

/** 每叶命中的最高风险等级（无风险返回 undefined），分叶表“按风险等级”筛选与角标共用 */
export function folioRiskLevels(risks: RiskItem[]): Map<string, RiskLevel> {
  const map = new Map<string, RiskLevel>();
  for (const r of risks) {
    if (!r.folio_id) continue;
    const prev = map.get(r.folio_id);
    if (!prev || RISK_RANK[r.level] < RISK_RANK[prev]) map.set(r.folio_id, r.level);
  }
  return map;
}

function nameHit(name: string, q: string): boolean {
  return name.toLocaleLowerCase().includes(q);
}

/**
 * 对分叶进度表应用筛选与排序。
 * - 阶段：叶当前所处阶段必须匹配；
 * - 风险等级：叶上命中的最高风险等级必须匹配（项目级风险不计入叶）；
 * - 叶名称：名称包含关键词即可（大小写/全半角不敏感）。
 */
export function filterFolios(
  folios: FolioProgress[],
  risks: RiskItem[],
  filter: DashboardFilter,
  sort: DashboardSort = DEFAULT_SORT
): FolioProgress[] {
  const q = filter.query.trim().toLocaleLowerCase();
  const levelOf = folioRiskLevels(risks);
  const rows = folios.filter(
    (f) =>
      (filter.stage === 'all' || f.stage === filter.stage) &&
      (filter.risk === 'all' || levelOf.get(f.folio_id) === filter.risk) &&
      (!q || nameHit(f.name, q))
  );
  const dir = sort.asc ? 1 : -1;
  return rows.sort((a, b) => {
    let cmp = 0;
    if (sort.key === 'name') cmp = compareFolioName(a.name, b.name);
    else if (sort.key === 'stage') cmp = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
    else return a.sequence - b.sequence || compareByName(a.name, b.name); // 默认：报告原顺序（叶序）
    if (cmp !== 0) return cmp * dir;
    return a.sequence - b.sequence || compareByName(a.name, b.name); // 次序键固定，保证结果稳定
  });
}

/**
 * 对风险清单应用筛选与排序，保留每条风险“前往该叶”所需的 folio_id。
 * - 风险等级：按风险条目自身等级过滤；
 * - 阶段筛选：要求关联叶当前处于该阶段（项目级风险被排除）；
 * - 叶名称关键词：只匹配绑定到匹配叶的风险（项目级风险不参与名称匹配）。
 */
export function filterRisks(
  risks: RiskItem[],
  folios: FolioProgress[],
  filter: DashboardFilter,
  sort: DashboardSort = DEFAULT_SORT
): RiskItem[] {
  const q = filter.query.trim().toLocaleLowerCase();
  const folioById = new Map(folios.map((f) => [f.folio_id, f]));
  const rows = risks.filter((r) => {
    if (filter.risk !== 'all' && r.level !== filter.risk) return false;
    if (filter.stage !== 'all' || q) {
      const f = r.folio_id ? folioById.get(r.folio_id) : undefined;
      if (!f) return false; // 项目级风险不参与阶段/叶名筛选
      if (filter.stage !== 'all' && f.stage !== filter.stage) return false;
      if (q && !nameHit(f.name, q)) return false;
    }
    return true;
  });
  const dir = sort.asc ? 1 : -1;
  return rows.sort((a, b) => {
    if (sort.key === 'default') {
      const cmp = RISK_RANK[a.level] - RISK_RANK[b.level];
      return cmp !== 0 ? cmp * dir : a.code.localeCompare(b.code) || a.title.localeCompare(b.title);
    }
    // 名称/阶段排序借由关联叶比较；项目级风险无对应叶，统一沉底并按等级保持稳定次序
    const fa = a.folio_id ? folioById.get(a.folio_id) : undefined;
    const fb = b.folio_id ? folioById.get(b.folio_id) : undefined;
    if (!fa || !fb) {
      if (fa && !fb) return -1;
      if (!fa && fb) return 1;
      return RISK_RANK[a.level] - RISK_RANK[b.level] || a.code.localeCompare(b.code);
    }
    const cmp =
      sort.key === 'name'
        ? compareFolioName(fa.name, fb.name)
        : STAGE_ORDER.indexOf(fa.stage) - STAGE_ORDER.indexOf(fb.stage);
    if (cmp !== 0) return cmp * dir;
    return RISK_RANK[a.level] - RISK_RANK[b.level] || a.code.localeCompare(b.code);
  });
}

/** 一次性返回筛选后的两张清单，供视图直接使用 */
export function queryDashboard(
  report: DashboardReport,
  filter: DashboardFilter,
  sort: DashboardSort = DEFAULT_SORT
): { folios: FolioProgress[]; risks: RiskItem[] } {
  return {
    folios: filterFolios(report.folios, report.risks, filter, sort),
    risks: filterRisks(report.risks, report.folios, filter, sort)
  };
}
