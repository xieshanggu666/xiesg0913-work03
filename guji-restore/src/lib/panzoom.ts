/**
 * 前后对比视图的缩放/平移状态模型（纯函数，便于单测）：
 *  - zoom：相对「适配视图」的倍数（1 = 整图适配容器）
 *  - cx/cy：视图中心对应的图像内容坐标（归一化，0..1 为图内，允许越界）
 * 前后两图共享同一份状态，各自按自己的适配比例换算 transform，因此天然同步；
 * 状态与容器尺寸无关，切换并排/滑动模式时观察位置自然保留。
 */

export interface ViewState {
  zoom: number;
  cx: number;
  cy: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 40;
/** 视图中心允许越出图外的余量（归一化），防止把图彻底拖丢 */
const CENTER_MARGIN = 0.5;

/** 适配视图：整图居中显示 */
export function fitView(): ViewState {
  return { zoom: 1, cx: 0.5, cy: 0.5 };
}

export function clampView(v: ViewState): ViewState {
  return {
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom)),
    cx: Math.min(1 + CENTER_MARGIN, Math.max(-CENTER_MARGIN, v.cx)),
    cy: Math.min(1 + CENTER_MARGIN, Math.max(-CENTER_MARGIN, v.cy))
  };
}

/** 图像在容器中的适配比例（contain 语义）；尺寸未知时返回 1 */
export function fitScale(img: Size, view: Size): number {
  if (img.w <= 0 || img.h <= 0 || view.w <= 0 || view.h <= 0) return 1;
  return Math.min(view.w / img.w, view.h / img.h);
}

/** 当前显示尺寸 = 图像自然尺寸 × 适配比例 × 缩放倍数 */
export function displaySize(img: Size, fit: number, zoom: number): Size {
  return { w: img.w * fit * zoom, h: img.h * fit * zoom };
}

/** 内容坐标 → 容器内屏幕位置（与 imageTransform 互为印证） */
export function contentToScreen(v: ViewState, fit: number, img: Size, view: Size, c: Point): Point {
  const disp = displaySize(img, fit, v.zoom);
  return {
    x: view.w / 2 + (c.x - v.cx) * disp.w,
    y: view.h / 2 + (c.y - v.cy) * disp.h
  };
}

/**
 * 是否响应此滚轮事件做缩放：仅纵向为主的滚动才缩放。
 * 触控板横向滚动（deltaX 为主，或 deltaY 为 0）不触发缩放，也不应被拦截默认行为。
 */
export function shouldZoomOnWheel(e: { deltaX: number; deltaY: number }): boolean {
  return e.deltaY !== 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX);
}

/**
 * 以容器内点 anchor 为锚缩放 factor 倍：缩放前后锚点下的图像内容保持不动。
 */
export function zoomAt(v: ViewState, factor: number, anchor: Point, view: Size, img: Size, fit: number): ViewState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const before = displaySize(img, fit, v.zoom);
  const after = displaySize(img, fit, zoom);
  if (before.w <= 0 || before.h <= 0 || after.w <= 0 || after.h <= 0) return clampView({ ...v, zoom });
  // 锚点对应的内容坐标（缩放前后一致）
  const cax = v.cx + (anchor.x - view.w / 2) / before.w;
  const cay = v.cy + (anchor.y - view.h / 2) / before.h;
  return clampView({
    zoom,
    cx: cax - (anchor.x - view.w / 2) / after.w,
    cy: cay - (anchor.y - view.h / 2) / after.h
  });
}

/** 按屏幕像素平移：图随手走（dx/dy 为指针位移） */
export function panBy(v: ViewState, dx: number, dy: number, img: Size, fit: number): ViewState {
  const disp = displaySize(img, fit, v.zoom);
  if (disp.w <= 0 || disp.h <= 0) return v;
  return clampView({ ...v, cx: v.cx - dx / disp.w, cy: v.cy - dy / disp.h });
}

/** 由状态计算图像层的 CSS transform 参数（配合 transform-origin: 0 0） */
export function imageTransform(v: ViewState, fit: number, img: Size, view: Size): { tx: number; ty: number; scale: number } {
  const disp = displaySize(img, fit, v.zoom);
  return {
    tx: view.w / 2 - v.cx * disp.w,
    ty: view.h / 2 - v.cy * disp.h,
    scale: fit * v.zoom
  };
}
