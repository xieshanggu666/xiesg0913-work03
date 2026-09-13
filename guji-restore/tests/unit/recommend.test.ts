import { describe, expect, it } from 'vitest';
import { fiberOverlap, recommendMaterials } from '@shared/recommend';
import { hexToLab } from '@shared/color';
import type { Material, Sample } from '@shared/types';

function mat(partial: Partial<Material>): Material {
  const color_hex = partial.color_hex ?? '#e8d9b8';
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    name: partial.name ?? 'm',
    category: partial.category ?? 'xuan',
    color_hex,
    lab: partial.lab === undefined ? hexToLab(color_hex) : partial.lab,
    fiber: partial.fiber ?? '',
    thickness_mm: partial.thickness_mm ?? null,
    weight_gsm: partial.weight_gsm ?? null,
    weave: partial.weave ?? '',
    ph: partial.ph ?? null,
    supplier: partial.supplier ?? '',
    note: partial.note ?? '',
    created_at: ''
  };
}

function sample(partial: Partial<Sample>): Sample {
  const color_hex = partial.color_hex ?? '#e8d9b8';
  return {
    id: 's1',
    project_id: null,
    kind: 'paper',
    name: '样本',
    source: '',
    color_hex,
    lab: partial.lab === undefined ? hexToLab(color_hex) : partial.lab,
    fiber: partial.fiber ?? '',
    grain: partial.grain ?? '',
    thickness_mm: partial.thickness_mm ?? null,
    absorbency: partial.absorbency ?? '',
    image_rel: null,
    note: '',
    created_at: ''
  };
}

describe('fiberOverlap', () => {
  it('完全相同成分 = 1', () => {
    expect(fiberOverlap('青檀皮 80% / 沙田稻草 20%', '青檀皮 60% / 沙田稻草 40%')).toBe(1);
  });
  it('完全不同 = 0', () => {
    expect(fiberOverlap('桑皮', '竹浆')).toBe(0);
  });
  it('部分重合介于 (0,1)', () => {
    const v = fiberOverlap('青檀皮 / 稻草', '青檀皮 / 麻');
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});

describe('recommendMaterials', () => {
  const s = sample({
    color_hex: '#e8d9b8',
    fiber: '青檀皮 70% / 沙田稻草 30%',
    thickness_mm: 0.09,
    absorbency: '中'
  });
  const pool = [
    mat({ id: 'a', name: '近似棉连', color_hex: '#ece0c2', fiber: '青檀皮 80% / 沙田稻草 20%', thickness_mm: 0.08, ph: 7.4, weave: '吸水性：中' }),
    mat({ id: 'b', name: '差异桑皮纸', category: 'pi', color_hex: '#f0e2c0', fiber: '桑皮 100%', thickness_mm: 0.16, ph: 6.6, weave: '吸水性：高' }),
    mat({ id: 'c', name: '浆糊', category: 'jiang', color_hex: '#f3ecd6', fiber: '小麦淀粉', ph: 6.8, weave: '吸水性：高' })
  ];

  it('默认排除浆糊类别', () => {
    const r = recommendMaterials(s, pool);
    expect(r.find((x) => x.material.category === 'jiang')).toBeUndefined();
  });

  it('按总分降序，近似材料排首位并给出理由', () => {
    const r = recommendMaterials(s, pool);
    expect(r[0].material.id).toBe('a');
    expect(r[0].score).toBeGreaterThan(r[1].score);
    expect(r[0].reasons.join(' ')).toContain('ΔE');
  });

  it('无任何可比指标时分数为中性', () => {
    const blankSample = sample({ lab: null, color_hex: '', fiber: '', thickness_mm: null, absorbency: '' });
    const r = recommendMaterials(blankSample, pool.map((m) => ({ ...m, lab: null, fiber: '', thickness_mm: null, ph: null, weave: '', note: '' })));
    expect(r.length).toBe(2);
    expect(r.every((x) => x.score === 50)).toBe(true);
  });

  it('categoryFilter 生效，limit 截断', () => {
    const r = recommendMaterials(s, pool, { categoryFilter: ['pi'], limit: 1 });
    expect(r).toHaveLength(1);
    expect(r[0].material.category).toBe('pi');
  });
});
