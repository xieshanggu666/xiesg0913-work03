import { describe, expect, it } from 'vitest';
import {
  clampView,
  contentToScreen,
  displaySize,
  fitScale,
  fitView,
  imageTransform,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  shouldZoomOnWheel,
  zoomAt
} from '../../src/lib/panzoom';

const img = { w: 900, h: 1300 };
const view = { w: 600, h: 800 };

describe('fitScale / displaySize', () => {
  it('contain 语义：取较小比例', () => {
    // 600/900 ≈ 0.667，800/1300 ≈ 0.615 → 取高向比例
    expect(fitScale(img, view)).toBeCloseTo(800 / 1300, 10);
  });
  it('尺寸未知时返回 1，不抛错', () => {
    expect(fitScale({ w: 0, h: 0 }, view)).toBe(1);
    expect(fitScale(img, { w: 0, h: 0 })).toBe(1);
  });
  it('displaySize = 自然尺寸 × 适配 × 缩放', () => {
    const fit = fitScale(img, view);
    const d = displaySize(img, fit, 2);
    expect(d.w).toBeCloseTo(img.w * fit * 2, 10);
    expect(d.h).toBeCloseTo(img.h * fit * 2, 10);
  });
});

describe('适配视图', () => {
  it('fitView 状态为 100% 居中', () => {
    expect(fitView()).toEqual({ zoom: 1, cx: 0.5, cy: 0.5 });
  });
  it('适配时图像居中：图心落在容器中心，四边留边距', () => {
    const fit = fitScale(img, view);
    const t = imageTransform(fitView(), fit, img, view);
    // 图心（0.5, 0.5）→ 容器中心
    expect(t.tx + 0.5 * img.w * t.scale).toBeCloseTo(view.w / 2, 10);
    expect(t.ty + 0.5 * img.h * t.scale).toBeCloseTo(view.h / 2, 10);
    // 高度撑满（本例高向为限制边）
    expect(img.h * t.scale).toBeCloseTo(view.h, 10);
  });
  it('contentToScreen 与 imageTransform 一致', () => {
    const v = { zoom: 2.3, cx: 0.31, cy: 0.77 };
    const fit = fitScale(img, view);
    const t = imageTransform(v, fit, img, view);
    const c = { x: 0.42, y: 0.18 };
    const s = contentToScreen(v, fit, img, view, c);
    expect(s.x).toBeCloseTo(t.tx + c.x * img.w * t.scale, 10);
    expect(s.y).toBeCloseTo(t.ty + c.y * img.h * t.scale, 10);
  });
});

describe('zoomAt 锚定缩放', () => {
  it('缩放前后锚点下的图像内容保持不动', () => {
    const fit = fitScale(img, view);
    let v = fitView();
    const anchor = { x: 123, y: 456 };
    // 锚点处的内容坐标
    const before = displaySize(img, fit, v.zoom);
    const c = {
      x: v.cx + (anchor.x - view.w / 2) / before.w,
      y: v.cy + (anchor.y - view.h / 2) / before.h
    };
    v = zoomAt(v, 1.5, anchor, view, img, fit);
    expect(v.zoom).toBeCloseTo(1.5, 10);
    const screen = contentToScreen(v, fit, img, view, c);
    expect(screen.x).toBeCloseTo(anchor.x, 8);
    expect(screen.y).toBeCloseTo(anchor.y, 8);
  });
  it('连续缩放与视图中心缩放按钮语义正确', () => {
    const fit = fitScale(img, view);
    let v = fitView();
    v = zoomAt(v, 1.25, { x: view.w / 2, y: view.h / 2 }, view, img, fit);
    // 以中心为锚缩放，中心内容不动
    expect(v.cx).toBeCloseTo(0.5, 10);
    expect(v.cy).toBeCloseTo(0.5, 10);
    expect(v.zoom).toBeCloseTo(1.25, 10);
  });
  it('缩放倍数被夹在 [MIN_ZOOM, MAX_ZOOM]', () => {
    const fit = fitScale(img, view);
    let v = fitView();
    for (let i = 0; i < 100; i++) v = zoomAt(v, 1.5, { x: 0, y: 0 }, view, img, fit);
    expect(v.zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 200; i++) v = zoomAt(v, 1 / 1.5, { x: 0, y: 0 }, view, img, fit);
    expect(v.zoom).toBe(MIN_ZOOM);
  });
});

describe('panBy 拖动平移', () => {
  it('图随手走：向右拖 100px，视图中心内容左移 100/显示宽', () => {
    const fit = fitScale(img, view);
    const v = panBy(fitView(), 100, 0, img, fit);
    const disp = displaySize(img, fit, 1);
    expect(v.cx).toBeCloseTo(0.5 - 100 / disp.w, 10);
    expect(v.cy).toBeCloseTo(0.5, 10);
  });
  it('平移后内容点位移等于指针位移', () => {
    const fit = fitScale(img, view);
    const v0 = { zoom: 2, cx: 0.4, cy: 0.6 };
    const c = { x: 0.45, y: 0.55 };
    const before = contentToScreen(v0, fit, img, view, c);
    const v1 = panBy(v0, 37, -21, img, fit);
    const after = contentToScreen(v1, fit, img, view, c);
    expect(after.x - before.x).toBeCloseTo(37, 8);
    expect(after.y - before.y).toBeCloseTo(-21, 8);
  });
  it('视图中心被限制在图外余量内，不会拖丢', () => {
    const fit = fitScale(img, view);
    const v = panBy(fitView(), -1e7, 1e7, img, fit);
    expect(v.cx).toBeGreaterThanOrEqual(-0.5);
    expect(v.cy).toBeLessThanOrEqual(1.5);
  });
});

describe('clampView', () => {
  it('越界状态被收拢', () => {
    const v = clampView({ zoom: 999, cx: -5, cy: 9 });
    expect(v.zoom).toBe(MAX_ZOOM);
    expect(v.cx).toBe(-0.5);
    expect(v.cy).toBe(1.5);
  });
});

describe('shouldZoomOnWheel（横向滚动不触发缩放）', () => {
  it('纵向滚动 → 缩放', () => {
    expect(shouldZoomOnWheel({ deltaX: 0, deltaY: -120 })).toBe(true);
    expect(shouldZoomOnWheel({ deltaX: 0, deltaY: 120 })).toBe(true);
  });
  it('纵向为主的斜向滚动 → 缩放', () => {
    expect(shouldZoomOnWheel({ deltaX: 10, deltaY: 40 })).toBe(true);
    expect(shouldZoomOnWheel({ deltaX: 30, deltaY: 30 })).toBe(true);
  });
  it('纯横向滚动（deltaY 为 0）→ 不缩放', () => {
    expect(shouldZoomOnWheel({ deltaX: 120, deltaY: 0 })).toBe(false);
    expect(shouldZoomOnWheel({ deltaX: -80, deltaY: 0 })).toBe(false);
  });
  it('横向为主的触控板滚动 → 不缩放', () => {
    expect(shouldZoomOnWheel({ deltaX: 100, deltaY: 20 })).toBe(false);
    expect(shouldZoomOnWheel({ deltaX: -53, deltaY: 1 })).toBe(false);
  });
  it('完全静止的事件 → 不缩放', () => {
    expect(shouldZoomOnWheel({ deltaX: 0, deltaY: 0 })).toBe(false);
  });
});

describe('模式切换（容器尺寸变化）', () => {
  it('同一状态在不同容器下保持同一内容中心', () => {
    // 并排（窄容器）→ 滑动（宽容器）：状态不变，视图中心内容不变
    const v = { zoom: 2, cx: 0.3, cy: 0.7 };
    const sideView = { w: 300, h: 800 };
    const slideView = { w: 600, h: 800 };
    for (const sv of [sideView, slideView]) {
      const fit = fitScale(img, sv);
      const center = contentToScreen(v, fit, img, sv, { x: v.cx, y: v.cy });
      expect(center.x).toBeCloseTo(sv.w / 2, 10);
      expect(center.y).toBeCloseTo(sv.h / 2, 10);
    }
  });
});
