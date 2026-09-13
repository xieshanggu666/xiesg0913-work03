import type { Layer, PlanVersion, Shape } from './types.js';

/**
 * 判断某叶当前的图层/标注方案是否已经另存为**人工**版本。
 *
 * 两点不能只看表面：
 *  1. 不能只看“是否存在人工版本”：存版之后若又改动（包括把标注全部删除），
 *     旧版本代表的就不是当前方案了（旧实现因此漏报“方案未保存”）。
 *  2. 不能拿导入时的 system 空基线做比对：删除全部标注后当前状态虽与空基线一致，
 *     但那只是“回到未开工状态”，并不等于用户保存过当前（空）方案。
 *
 * 做法：把当前方案规范化为稳定签名，与该叶任一**人工**版本快照比较，一致即视为已保存。
 * 允许匹配任意历史版本而非仅最新版——用户“回退到历史版本”后当前状态与该快照一致，
 * 属于合法的已保存状态（回退前也会自动备份当前状态）。
 * 没有任何人工版本时恒为 false（是否需要提示由调用方结合“当前是否有标注”判断，
 * 以区分“刚导入、尚未开工”的空叶）。
 */
export function planSignature(layers: Layer[], shapes: Shape[]): string {
  const l = [...layers].sort((a, b) => a.id.localeCompare(b.id));
  const s = [...shapes].sort((a, b) => a.id.localeCompare(b.id));
  return stableStringify({ layers: l, shapes: s });
}

export function currentPlanIsSaved(
  current: { layers: Layer[]; shapes: Shape[] },
  versions: PlanVersion[]
): boolean {
  const manual = versions.filter((v) => v.author !== 'system');
  if (manual.length === 0) return false;
  const sig = planSignature(current.layers, current.shapes);
  return manual.some((v) => planSignature(v.snapshot.layers, v.snapshot.shapes) === sig);
}

/** 递归按 key 排序的 JSON 序列化，避免对象键顺序差异导致误判 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]));
    return '{' + entries.join(',') + '}';
  }
  return JSON.stringify(value);
}
