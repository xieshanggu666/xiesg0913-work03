import { describe, expect, it } from 'vitest';
import type { Geometry } from '@shared/types';

// 复刻 services 中的 normalizeGeometry（纯函数部分单独导出更便于测试）
function normalizeGeometry(g: Geometry): Geometry {
  if (g.type === 'polygon') {
    const pts = (g.points ?? []).map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
    if (pts.length > 1) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) pts.pop();
    }
    return { type: 'polygon', points: pts };
  }
  let { x = 0, y = 0, w = 0, h = 0 } = g;
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return { type: g.type, x, y, w, h };
}

describe('normalizeGeometry', () => {
  it('负宽高拖拽矩形被翻正', () => {
    expect(normalizeGeometry({ type: 'rect', x: 100, y: 100, w: -40, h: -20 })).toEqual({
      type: 'rect',
      x: 60,
      y: 80,
      w: 40,
      h: 20
    });
  });
  it('多边形去除重复闭合末点', () => {
    const g = normalizeGeometry({
      type: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
        { x: 0, y: 0 }
      ]
    });
    expect(g.points).toHaveLength(3);
  });
  it('坐标保留两位小数', () => {
    const g = normalizeGeometry({
      type: 'polygon',
      points: [
        { x: 1.23456, y: 2.98765 },
        { x: 5, y: 6 },
        { x: 7, y: 1 }
      ]
    });
    expect(g.points?.[0]).toEqual({ x: 1.23, y: 2.99 });
  });
});
