import Konva from 'konva';
import type { Folio, Layer, Shape } from '@shared/types';
import type { DamageKind, Geometry, Point } from '@shared/types';
import { DAMAGE_META } from '@shared/constants';

export type Tool = 'select' | 'rect' | 'ellipse' | 'polygon';

export interface EditorCallbacks {
  onCreateShape(input: { layer_id: string; damage: DamageKind; geometry: Geometry; label: string }): Promise<Shape | null>;
  onUpdateShape(shape: Shape, geometry: Geometry): Promise<void>;
  onSelect?(shape: Shape | null): void;
}

/**
 * Konva 画布控制器：
 *  - 底图为原图（只读显示，永不修改）
 *  - 每个业务图层一个 Konva.Layer；隐藏/锁定/透明度直接反映
 *  - 矩形/椭圆拖拽绘制、多边形逐点双击闭合
 *  - 坐标始终为「原图像素」坐标，缩放只改变 scale
 */
export class AnnotationEditor {
  stage: Konva.Stage;
  private bgLayer: Konva.Layer;
  private overlay: Konva.Layer;
  private layers = new Map<string, Konva.Layer>();
  private nodes = new Map<string, Konva.Shape>();
  private scale = 1;
  private fitScale = 1;
  private tool: Tool = 'select';
  private damage: DamageKind = 'wormhole';
  private draft: Konva.Shape | null = null;
  private polyPoints: Point[] = [];
  private image: HTMLImageElement | null = null;
  private bgImage: Konva.Image | null = null;
  private cb: EditorCallbacks;
  constructor(container: HTMLDivElement, _folio: Folio, cb: EditorCallbacks) {
    this.cb = cb;
    this.stage = new Konva.Stage({ container: container as unknown as string, width: container.clientWidth, height: container.clientHeight, draggable: false });
    this.bgLayer = new Konva.Layer();
    this.overlay = new Konva.Layer();
    this.stage.add(this.bgLayer);
    this.stage.add(this.overlay);
    this.bindStage();
    window.addEventListener('resize', this.onResize);
    // 容器可能在编辑器创建后才获得布局尺寸（grid/flex），监听并重适配
    this.resizeObserver = new ResizeObserver(() => {
      const c = this.stage.container();
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w > 0 && h > 0 && (w !== this.stage.width() || h !== this.stage.height())) {
        this.stage.size({ width: w, height: h });
        if (this.image && !this.userInteracted) this.fit();
      }
    });
    this.resizeObserver.observe(this.stage.container());
  }
  private resizeObserver: ResizeObserver | null = null;
  private userInteracted = false;

  loadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.bgImage?.destroy();
        this.bgImage = new Konva.Image({ image: img, listening: false });
        this.bgLayer.add(this.bgImage);
        this.fit();
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  setLayers(layers: Layer[]): void {
    for (const [id, node] of this.layers) {
      if (!layers.find((l) => l.id === id)) {
        node.destroy();
        this.layers.delete(id);
      }
    }
    for (const l of layers) {
      let node = this.layers.get(l.id);
      if (!node) {
        node = new Konva.Layer({ listening: !l.locked });
        // 顺序按 order_index；依次插入到 overlay 之前
        this.stage.add(node);
        this.stage.add(this.overlay);
        node.on('click tap', (e) => {
          if ((e.target as unknown as Konva.Layer) === node) return;
          const shapeNode = e.target as Konva.Node;
          const sid = shapeNode.id && /^shp-/.test(shapeNode.id()) ? shapeNode.id().slice(4) : null;
          if (sid) this.select(sid);
        });
        this.layers.set(l.id, node);
      }
      node.visible(l.visible);
      node.opacity(l.opacity == null ? 0.5 : l.opacity);
      node.listening(!l.locked);
    }
    // z 序
    layers.forEach((l, i) => {
      const node = this.layers.get(l.id);
      if (node) node.zIndex(i + 1);
    });
    this.overlay.zIndex(layers.length + 1);
    this.overlay.draw();
  }

  setShapes(shapes: Shape[], activeLayerId: string | null): void {
    const keep = new Set(shapes.map((s) => s.id));
    for (const [id, node] of this.nodes) {
      if (!keep.has(id)) {
        node.destroy();
        this.nodes.delete(id);
      }
    }
    for (const s of shapes) {
      const meta = DAMAGE_META[s.damage];
      const common = {
        id: `shp-${s.id}`,
        stroke: meta.color,
        strokeWidth: 2,
        fill: meta.color,
        fillOpacity: 0.14,
        draggable: false
      };
      let node = this.nodes.get(s.id);
      const layer = this.layers.get(s.layer_id) ?? this.overlay;
      if (!node) {
        if (s.geometry.type === 'rect') {
          node = new Konva.Rect({ x: s.geometry.x, y: s.geometry.y, width: s.geometry.w, height: s.geometry.h, ...common });
        } else if (s.geometry.type === 'ellipse') {
          node = new Konva.Ellipse({
            x: (s.geometry.x ?? 0) + (s.geometry.w ?? 0) / 2,
            y: (s.geometry.y ?? 0) + (s.geometry.h ?? 0) / 2,
            radiusX: (s.geometry.w ?? 0) / 2,
            radiusY: (s.geometry.h ?? 0) / 2,
            ...common
          });
        } else {
          node = new Konva.Line({
            points: (s.geometry.points ?? []).flatMap((p) => [p.x, p.y]),
            closed: true,
            ...common
          });
        }
        layer.add(node);
        this.nodes.set(s.id, node);
      }
      node.strokeWidth(s.id === this.selectedId ? 3 : 2);
      node.opacity(activeLayerId === s.layer_id ? 1 : 0.55);
    }
    this.stage.batchDraw();
  }

  selectedId: string | null = null;
  select(id: string | null): void {
    this.selectedId = id;
    this.cb.onSelect?.(id ? this.shapeById(id) : null);
  }
  private shapeById(id: string): Shape | null {
    return this.currentShapes.find((s) => s.id === id) ?? null;
  }
  private currentShapes: Shape[] = [];

  setTool(tool: Tool): void {
    this.tool = tool;
    this.cancelDraft();
    const container = this.stage.container();
    container.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    this.stage.draggable(false);
  }
  setDamage(d: DamageKind): void {
    this.damage = d;
  }

  private bindStage(): void {
    const stage = this.stage;
    stage.on('wheel', (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      this.userInteracted = true;
      const scaleBy = 1.12;
      const oldScale = this.scale;
      const pointer = stage.getPointerPosition()!;
      const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
      this.scale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      this.scale = Math.max(0.1, Math.min(12, this.scale));
      const newPos = { x: pointer.x - mousePointTo.x * this.scale, y: pointer.y - mousePointTo.y * this.scale };
      stage.scale({ x: this.scale, y: this.scale });
      stage.position(newPos);
    });
    stage.on('mousedown', (e) => this.onDown(e));
    stage.on('mousemove', (e) => this.onMove(e));
    stage.on('mouseup', () => this.onUp());
    stage.on('click', (e) => {
      if (this.tool === 'polygon') {
        const p = this.toImagePoint(e);
        if (!p) return;
        this.polyPoints.push(p);
        this.renderDraft();
      }
    });
    stage.on('dblclick', () => {
      if (this.tool === 'polygon' && this.polyPoints.length >= 3) void this.commitPolygon();
    });
  }

  private toImagePoint(_e?: Konva.KonvaEventObject<MouseEvent>): Point | null {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;
    const t = this.stage.getAbsoluteTransform().copy().invert();
    const p = t.point(pointer);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  private start: Point | null = null;
  private onDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.evt.button !== 0 || this.tool === 'select' || this.tool === 'polygon') {
      if (this.tool === 'select') this.stage.draggable(true);
      return;
    }
    const p = this.toImagePoint(e);
    if (!p) return;
    this.start = p;
    const color = DAMAGE_META[this.damage].color;
    const common = { stroke: color, strokeWidth: 2, fill: color, fillOpacity: 0.16, listening: false };
    if (this.tool === 'rect') {
      this.draft = new Konva.Rect({ x: p.x, y: p.y, width: 0, height: 0, ...common });
    } else {
      this.draft = new Konva.Ellipse({ x: p.x, y: p.y, radiusX: 0, radiusY: 0, ...common });
    }
    this.overlay.add(this.draft);
  }
  private onMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (this.tool === 'polygon' && this.polyPoints.length) {
      this.hoverPoint = this.toImagePoint(e);
      this.renderDraft();
      return;
    }
    if (!this.start || !this.draft) return;
    const p = this.toImagePoint(e);
    if (!p) return;
    if (this.draft instanceof Konva.Rect) {
      this.draft.setAttrs({ x: Math.min(this.start.x, p.x), y: Math.min(this.start.y, p.y), width: Math.abs(p.x - this.start.x), height: Math.abs(p.y - this.start.y) });
    } else if (this.draft instanceof Konva.Ellipse) {
      this.draft.setAttrs({
        x: (this.start.x + p.x) / 2,
        y: (this.start.y + p.y) / 2,
        radiusX: Math.abs(p.x - this.start.x) / 2,
        radiusY: Math.abs(p.y - this.start.y) / 2
      });
    }
    this.overlay.batchDraw();
  }
  private async onUp(): Promise<void> {
    this.stage.draggable(false);
    if (!this.draft || !this.start) {
      this.start = null;
      return;
    }
    const node = this.draft;
    let geometry: Geometry | null = null;
    if (node instanceof Konva.Rect && node.width() > 4 && node.height() > 4) {
      geometry = { type: 'rect', x: node.x(), y: node.y(), w: node.width(), h: node.height() };
    } else if (node instanceof Konva.Ellipse && node.radiusX() > 2) {
      geometry = { type: 'ellipse', x: node.x() - node.radiusX(), y: node.y() - node.radiusY(), w: node.radiusX() * 2, h: node.radiusY() * 2 };
    }
    this.cancelDraft();
    this.start = null;
    if (geometry) await this.commit(geometry);
  }

  private hoverPoint: Point | null = null;
  private renderDraft(): void {
    this.overlay.find('#draft-poly').forEach((n) => n.destroy());
    const pts = this.hoverPoint ? [...this.polyPoints, this.hoverPoint] : this.polyPoints;
    if (pts.length >= 2) {
      const color = DAMAGE_META[this.damage].color;
      const line = new Konva.Line({
        id: 'draft-poly',
        points: pts.flatMap((p) => [p.x, p.y]),
        closed: false,
        stroke: color,
        strokeWidth: 2,
        dash: [6, 4],
        listening: false
      });
      this.overlay.add(line);
    }
    // 顶点
    this.overlay.find('#draft-dot').forEach((n) => n.destroy());
    for (const p of this.polyPoints) {
      this.overlay.add(
        new Konva.Circle({ id: 'draft-dot', x: p.x, y: p.y, radius: 4, fill: '#fff', stroke: DAMAGE_META[this.damage].color, strokeWidth: 2, listening: false })
      );
    }
    this.overlay.batchDraw();
  }

  private async commitPolygon(): Promise<void> {
    const pts = this.polyPoints;
    this.cancelDraft();
    if (pts.length < 3) return;
    await this.commit({ type: 'polygon', points: pts });
  }

  private activeLayerId: string | null = null;
  setActiveLayer(id: string | null): void {
    this.activeLayerId = id;
  }

  private async commit(geometry: Geometry): Promise<void> {
    if (!this.activeLayerId) {
      window.alert('请先在右侧选择一个可绘图层');
      return;
    }
    const meta = DAMAGE_META[this.damage];
    const created = await this.cb.onCreateShape({
      layer_id: this.activeLayerId,
      damage: this.damage,
      geometry,
      label: `${meta.label} ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
    });
    if (created) {
      this.currentShapes.push(created);
      this.setShapes(this.currentShapes, this.activeLayerId);
      this.select(created.id);
    }
  }

  cancelDraft(): void {
    this.draft?.destroy();
    this.draft = null;
    this.polyPoints = [];
    this.hoverPoint = null;
    this.overlay.find('#draft-poly').forEach((n) => n.destroy());
    this.overlay.find('#draft-dot').forEach((n) => n.destroy());
    this.overlay.batchDraw();
  }

  getShapes(): Shape[] {
    return this.currentShapes;
  }
  syncShapes(shapes: Shape[]): void {
    this.currentShapes = shapes;
    this.setShapes(shapes, this.activeLayerId);
  }

  zoomIn(): void {
    this.zoom(1.2);
  }
  zoomOut(): void {
    this.zoom(1 / 1.2);
  }
  private zoom(factor: number): void {
    const old = this.scale;
    this.scale = Math.max(0.1, Math.min(12, old * factor));
    this.stage.scale({ x: this.scale, y: this.scale });
    this.stage.batchDraw();
  }
  fit(): void {
    if (!this.image || !this.stage.width()) return;
    this.fitScale = Math.min(this.stage.width() / this.image.width, this.stage.height() / this.image.height) * 0.96;
    this.scale = this.fitScale;
    this.stage.scale({ x: this.scale, y: this.scale });
    this.stage.position({
      x: (this.stage.width() - this.image.width * this.scale) / 2,
      y: (this.stage.height() - this.image.height * this.scale) / 2
    });
    this.stage.batchDraw();
  }
  actualSize(): void {
    this.scale = 1;
    this.stage.scale({ x: 1, y: 1 });
    this.stage.position({ x: 40, y: 20 });
    this.stage.batchDraw();
  }

  /** 删除当前选中标注 */
  async deleteSelected(): Promise<void> {
    if (!this.selectedId) return;
    const id = this.selectedId;
    this.select(null);
    this.nodes.get(id)?.destroy();
    this.nodes.delete(id);
    this.currentShapes = this.currentShapes.filter((s) => s.id !== id);
    this.stage.batchDraw();
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.stage.destroy();
  }
  private onResize = (): void => {
    const c = this.stage.container();
    this.stage.size({ width: c.clientWidth, height: c.clientHeight });
  };
}
