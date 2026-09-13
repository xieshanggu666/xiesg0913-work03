import { describe, expect, it } from 'vitest';
import { boundingBox, centroid, geometryArea, hitTest, polygonArea } from '@shared/geometry';

describe('polygonArea', () => {
  it('计算矩形多边形面积（鞋带公式）', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 8 },
        { x: 0, y: 8 }
      ])
    ).toBeCloseTo(80);
  });
  it('顶点顺序反向不影响绝对值', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 0, y: 8 },
        { x: 10, y: 8 },
        { x: 10, y: 0 }
      ])
    ).toBeCloseTo(80);
  });
  it('不足三点返回 0', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe('geometryArea', () => {
  it('矩形', () => {
    expect(geometryArea({ type: 'rect', x: 1, y: 2, w: 10, h: 5 })).toBe(50);
  });
  it('椭圆按 πab', () => {
    expect(geometryArea({ type: 'ellipse', x: 0, y: 0, w: 10, h: 4 })).toBeCloseTo(Math.PI * 5 * 2);
  });
  it('多边形', () => {
    expect(
      geometryArea({
        type: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 0, y: 4 }
        ]
      })
    ).toBeCloseTo(8);
  });
});

describe('hitTest', () => {
  it('矩形命中', () => {
    expect(hitTest({ type: 'rect', x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5 })).toBe(true);
    expect(hitTest({ type: 'rect', x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 5 })).toBe(false);
  });
  it('椭圆边界', () => {
    expect(hitTest({ type: 'ellipse', x: 0, y: 0, w: 10, h: 6 }, { x: 5, y: 3 })).toBe(true);
    expect(hitTest({ type: 'ellipse', x: 0, y: 0, w: 10, h: 6 }, { x: 0, y: 0 })).toBe(false);
  });
  it('多边形射线法', () => {
    const g = {
      type: 'polygon' as const,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ]
    };
    expect(hitTest(g, { x: 5, y: 5 })).toBe(true);
    expect(hitTest(g, { x: 15, y: 5 })).toBe(false);
  });
});

describe('boundingBox / centroid', () => {
  it('多边形包围盒', () => {
    expect(
      boundingBox({
        type: 'polygon',
        points: [
          { x: 3, y: 8 },
          { x: 12, y: 2 },
          { x: 20, y: 30 }
        ]
      })
    ).toEqual({ x: 3, y: 2, w: 17, h: 28 });
  });
  it('质心', () => {
    const c = centroid([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 4 }
    ]);
    expect(c?.x).toBeCloseTo(4 / 3);
    expect(c?.y).toBeCloseTo(4 / 3);
  });
});
