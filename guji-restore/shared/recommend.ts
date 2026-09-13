import type { Material, Recommendation, Sample } from './types.js';
import { deltaE2000, colorMatchScore } from './color.js';
import { MATERIAL_CATEGORY_META } from './constants.js';

export interface RecommendOptions {
  /** 各维度权重，默认色相符最重；修复师可按实际调整 */
  weights?: { color?: number; thickness?: number; fiber?: number; absorbency?: number; ph?: number };
  /** 限定材料类别；补“洞”通常只用薄纸/绢，浆糊是辅料不参与纸面对比 */
  categoryFilter?: Material['category'][];
  limit?: number;
}

interface Dim {
  score: number;
  weight: number;
  reason: string;
}

/**
 * 材料推荐：以「样本 vs 材料」的多维相似度加权打分。
 * 只给出排序与逐条理由，最终选择必须由修复师人工判断（伦理与可逆性优先）。
 */
export function recommendMaterials(
  sample: Sample | null,
  materials: Material[],
  opts: RecommendOptions = {}
): Recommendation[] {
  const w = {
    color: opts.weights?.color ?? 0.5,
    thickness: opts.weights?.thickness ?? 0.2,
    fiber: opts.weights?.fiber ?? 0.15,
    absorbency: opts.weights?.absorbency ?? 0.1,
    ph: opts.weights?.ph ?? 0.05
  };
  const pool = opts.categoryFilter
    ? materials.filter((m) => opts.categoryFilter!.includes(m.category))
    : materials.filter((m) => m.category !== 'jiang');

  const results = pool.map((m) => scoreMaterial(sample, m, w));
  results.sort((a, b) => b.score - a.score);
  return (opts.limit ? results.slice(0, opts.limit) : results);
}

function scoreMaterial(
  sample: Sample | null,
  m: Material,
  w: { color: number; thickness: number; fiber: number; absorbency: number; ph: number }
): Recommendation {
  const dims: Dim[] = [];
  let dE: number | null = null;

  // 1) 色相符（Lab ΔE2000）
  if (sample?.lab && m.lab) {
    dE = deltaE2000(sample.lab, m.lab);
    const s = colorMatchScore(dE);
    dims.push({
      score: s,
      weight: w.color,
      reason:
        dE <= 2
          ? `色相一致（ΔE≈${dE.toFixed(1)}，视觉几乎无差）`
          : dE <= 5
            ? `色相接近（ΔE≈${dE.toFixed(1)}，可接受，建议染色微调）`
            : `色差较大（ΔE≈${dE.toFixed(1)}，需做色处理）`
    });
  } else {
    // 无测色数据时该维度不参与权重，避免“瞎猜”
    dims.push({ score: 0, weight: 0, reason: '缺少 Lab 测色数据，未评估色相' });
  }

  // 2) 厚度
  if (sample?.thickness_mm != null && m.thickness_mm != null) {
    const diff = Math.abs(sample.thickness_mm - m.thickness_mm);
    const s = Math.max(0, 100 - (diff / 0.15) * 100);
    dims.push({
      score: s,
      weight: w.thickness,
      reason:
        diff <= 0.02
          ? `厚度吻合（差 ${(diff * 1000).toFixed(0)}μm）`
          : `厚度差 ${(diff * 1000).toFixed(0)}μm，${diff > 0.05 ? '补后可能起梗' : '基本可用'}`
    });
  } else {
    dims.push({ score: 0, weight: 0, reason: '缺厚度数据，未评估' });
  }

  // 3) 纤维成分（关键词重合度）
  if (sample?.fiber && m.fiber) {
    const s = fiberOverlap(sample.fiber, m.fiber) * 100;
    dims.push({
      score: s,
      weight: w.fiber,
      reason:
        s >= 60 ? '纤维成分相近' : s > 0 ? '纤维成分部分相近' : '纤维成分差异大，老化伸缩率可能不同'
    });
  } else {
    dims.push({ score: 0, weight: 0, reason: '缺纤维数据，未评估' });
  }

  // 4) 吸水性
  if (sample?.absorbency && /[低中高]/.test(sample.absorbency)) {
    const s = sample.absorbency === absorbencyLabel(m) ? 100 : 40;
    dims.push({
      score: s,
      weight: w.absorbency,
      reason:
        s === 100 ? `吸水性匹配（${sample.absorbency}）` : `吸水性不一致（样本${sample.absorbency} / 材料${absorbencyLabel(m) ?? '未知'}）`
    });
  } else {
    dims.push({ score: 0, weight: 0, reason: '缺吸水性数据，未评估' });
  }

  // 5) pH（中性至弱碱为佳，修复用纸 pH 7..8.5）
  if (m.ph != null) {
    const ideal = m.ph >= 7 && m.ph <= 8.5;
    const mild = m.ph >= 6.5 && m.ph < 9;
    const s = ideal ? 100 : mild ? 70 : 25;
    dims.push({
      score: s,
      weight: w.ph,
      reason: ideal ? `pH ${m.ph} 中性，利于耐久` : m.ph < 7 ? `pH ${m.ph} 偏酸，有继续酸化风险` : `pH ${m.ph} 偏碱`
    });
  } else {
    dims.push({ score: 0, weight: 0, reason: '缺 pH 数据，未评估' });
  }

  const totalWeight = dims.reduce((a, d) => a + d.weight, 0);
  const score =
    totalWeight === 0
      ? 50 // 无任何可比指标，给中性分并显著提示
      : dims.reduce((a, d) => a + d.score * d.weight, 0) / totalWeight;

  const reasons = [
    `类别：${MATERIAL_CATEGORY_META[m.category]}；克重 ${m.weight_gsm ? m.weight_gsm + 'gsm' : '未记录'}`,
    ...dims.filter((d) => d.weight > 0 || d.reason.includes('缺少')).map((d) => d.reason)
  ];

  return { material: m, score: Math.round(score * 10) / 10, reasons, color_delta_e: dE };
}

/** 从材料备注里没有吸水性字段，用 weave/note 简单规则兜底；实际以样本 absorbency 文本匹配材料备注 */
function absorbencyLabel(m: Material): string | null {
  const hit = /吸水性?[：:]?\s*([低中高])/.exec(`${m.weave} ${m.note}`);
  return hit ? hit[1] : null;
}

/** 纤维成分字符串的 token 重合度（Jaccard，去掉百分比与空白） */
export function fiberOverlap(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .replace(/\d+(\.\d+)?%/g, '')
        .split(/[\/、,，\s]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 1)
    );
  const A = tok(a);
  const B = tok(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) {
    for (const y of B) {
      if (x === y || x.includes(y) || y.includes(x)) {
        inter++;
        break;
      }
    }
  }
  return inter / Math.min(A.size, B.size);
}
