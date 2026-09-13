import type { Layer, PlanVersion, Shape } from './types.js';

/**
 * 判断某叶当前的图层/标注方案是否已经另存为版本。
 *
 * 不能只看“是否存在人工版本”：存版之后若又改动过图层或标注，旧版本代表的就不是
 * 当前方案了（旧实现正是因此漏报“方案未保存”）。
 *
 * 做法：把当前方案规范化为稳定签名，与该叶**任一**版本快照比较，一致即视为已保存。
 * 允许匹配任意历史版本而非仅最新版——用户“回退到历史版本”后当前状态与该快照一致，
 * 属于合法的已保存状态（回退前也会自动备份当前状态）。
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
  const sig = planSignature(current.layers, current.shapes);
  return versions.some((v) => planSignature(v.snapshot.layers, v.snapshot.shapes) === sig);
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
