import type { Geometry, Point } from './types.js';

/** 标注几何（图像像素坐标）的面积估算，用于破损范围统计与材料贴合度 */
export function geometryArea(g: Geometry): number {
  switch (g.type) {
    case 'rect':
    case 'ellipse': {
      const w = Math.max(0, g.w ?? 0);
      const h = Math.max(0, g.h ?? 0);
      if (g.type === 'rect') return w * h;
      return Math.PI * (w / 2) * (h / 2);
    }
    case 'polygon':
      return polygonArea(g.points ?? []);
    default:
      return 0;
  }
}

/** 鞋带公式求多边形面积（顶点按图像像素坐标，面积始终为正） */
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

/** 多边形质心（用于批注锚点定位） */
export function centroid(points: Point[]): Point | null {
  if (points.length === 0) return null;
  if (points.length < 3) return { ...points[0] };
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const cross = p.x * q.y - q.x * p.y;
    area += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-9) return { x: points[0].x, y: points[0].y };
  cx /= 6 * area;
  cy /= 6 * area;
  return { x: cx, y: cy };
}

export function geometryCenter(g: Geometry): Point | null {
  if (g.type === 'polygon') return centroid(g.points ?? []);
  if (g.x == null || g.y == null) return null;
  return { x: g.x + (g.w ?? 0) / 2, y: g.y + (g.h ?? 0) / 2 };
}

/** 判断点是否在几何内（矩形/椭圆/多边形，用于点击命中） */
export function hitTest(g: Geometry, p: Point): boolean {
  switch (g.type) {
    case 'rect':
      return (
        p.x >= (g.x ?? 0) &&
        p.x <= (g.x ?? 0) + (g.w ?? 0) &&
        p.y >= (g.y ?? 0) &&
        p.y <= (g.y ?? 0) + (g.h ?? 0)
      );
    case 'ellipse': {
      const rx = (g.w ?? 0) / 2;
      const ry = (g.h ?? 0) / 2;
      if (rx === 0 || ry === 0) return false;
      const dx = (p.x - ((g.x ?? 0) + rx)) / rx;
      const dy = (p.y - ((g.y ?? 0) + ry)) / ry;
      return dx * dx + dy * dy <= 1;
    }
    case 'polygon':
      return pointInPolygon(g.points ?? [], p);
  }
}

export function pointInPolygon(points: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i];
    const pj = points[j];
    const intersects =
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** 将任意几何规范化为左上角 + 宽高的包围盒 */
export function boundingBox(g: Geometry): { x: number; y: number; w: number; h: number } {
  if (g.type === 'polygon') {
    const pts = g.points ?? [];
    if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: g.x ?? 0, y: g.y ?? 0, w: g.w ?? 0, h: g.h ?? 0 };
}
