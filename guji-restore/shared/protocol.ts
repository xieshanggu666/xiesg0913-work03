import type { DashboardReport } from './dashboard.js';
import type {
  Comment,
  CommentTarget,
  ExportResult,
  Folio,
  ID,
  Layer,
  Material,
  PlanSnapshot,
  PlanVersion,
  Project,
  Recommendation,
  RestorationStep,
  Sample,
  SampleKind,
  Shape
} from './types.js';
import type { DamageKind, LayerKind, MaterialCategory } from './types.js';
import type { Geometry } from './types.js';

/**
 * 渲染进程可调用的全部后端能力。
 * Electron 环境由 preload 桥接 IPC；浏览器/测试环境由内存 Mock 实现同构接口。
 */
export interface GujiApi {
  app: {
    getDataDir(): Promise<string>;
    openDataDir(): Promise<void>;
    /** 导入内置样例项目，返回项目 ID；已存在则返回已有项目 */
    importSamples(operator: string): Promise<{ projectId: ID; folioCount: number }>;
  };

  projects: {
    list(): Promise<Project[]>;
    create(input: {
      name: string;
      author: string;
      shelf_no: string;
      era: string;
      description: string;
    }): Promise<Project>;
    update(id: ID, patch: Partial<Project>): Promise<Project>;
    remove(id: ID): Promise<void>;
    stats(id: ID): Promise<{
      folios: number;
      shapes: number;
      damagedAreaPx: number;
      steps: number;
      comments: number;
    }>;
  };

  folios: {
    list(projectId: ID): Promise<Folio[]>;
    /** srcPath 为用户通过对话框选择的绝对路径；原图会被复制为只读副本 */
    import(projectId: ID, files: { name: string; srcPath: string }[]): Promise<Folio[]>;
    update(id: ID, patch: Partial<Pick<Folio, 'name' | 'note'>>): Promise<Folio>;
    remove(id: ID): Promise<void>;
    /** 上传修复后对照图（不覆盖原图） */
    setAfterImage(folioId: ID, srcPath: string): Promise<Folio>;
    /** 计算图像平均色（Lab），供快速建样本 */
    averageColor(folioId: ID, geo: Geometry | null): Promise<{ hex: string }>;
  };

  layers: {
    list(folioId: ID): Promise<Layer[]>;
    create(folioId: ID, input: { name: string; kind: LayerKind; color: string }): Promise<Layer>;
    update(
      id: ID,
      patch: Partial<Pick<Layer, 'name' | 'color' | 'visible' | 'locked' | 'opacity' | 'order_index'>>
    ): Promise<Layer>;
    remove(id: ID): Promise<void>;
  };

  shapes: {
    list(folioId: ID): Promise<Shape[]>;
    create(
      folioId: ID,
      input: { layer_id: ID; damage: DamageKind; geometry: Geometry; label?: string; note?: string }
    ): Promise<Shape>;
    update(
      id: ID,
      patch: Partial<Pick<Shape, 'layer_id' | 'damage' | 'geometry' | 'label' | 'note' | 'order_index'>>
    ): Promise<Shape>;
    remove(id: ID): Promise<void>;
  };

  samples: {
    list(kind?: SampleKind): Promise<Sample[]>;
    create(input: Omit<Sample, 'id' | 'created_at' | 'updated_at'>): Promise<Sample>;
    update(id: ID, patch: Partial<Sample>): Promise<Sample>;
    remove(id: ID): Promise<void>;
  };

  materials: {
    list(category?: MaterialCategory): Promise<Material[]>;
    create(input: Omit<Material, 'id' | 'created_at' | 'updated_at'>): Promise<Material>;
    update(id: ID, patch: Partial<Material>): Promise<Material>;
    remove(id: ID): Promise<void>;
    recommend(sampleId: ID, opts?: { categoryFilter?: MaterialCategory[] }): Promise<Recommendation[]>;
  };

  steps: {
    list(projectId: ID): Promise<RestorationStep[]>;
    create(input: Omit<RestorationStep, 'id' | 'created_at'>): Promise<RestorationStep>;
    update(id: ID, patch: Partial<RestorationStep>): Promise<RestorationStep>;
    remove(id: ID): Promise<void>;
  };

  versions: {
    list(folioId: ID): Promise<PlanVersion[]>;
    /** 以当前图层/标注生成新版本快照 */
    save(folioId: ID, input: { label: string; note: string; author: string }): Promise<PlanVersion>;
    /** 回退：把快照覆盖为当前图层/标注；回退前自动存一个回退前快照 */
    restore(versionId: ID, author: string): Promise<PlanVersion>;
    snapshot(folioId: ID): Promise<PlanSnapshot>;
  };

  comments: {
    list(projectId: ID): Promise<Comment[]>;
    create(input: {
      project_id: ID;
      folio_id?: ID | null;
      target_type: CommentTarget;
      target_id?: ID | null;
      author: string;
      body: string;
    }): Promise<Comment>;
    resolve(id: ID, resolved: boolean): Promise<Comment>;
    remove(id: ID): Promise<void>;
  };

  archive: {
    /** 生成离线 HTML 档案 + 原图/对照图/校验清单 zip */
    exportProject(projectId: ID, opts: { includeOriginal: boolean }): Promise<ExportResult>;
  };

  dashboard: {
    /** 项目进度与风险看板：由叶/标注/工序/批注/版本实时推导，不落库 */
    get(projectId: ID): Promise<DashboardReport>;
  };

  dialog: {
    pickImages(): Promise<{ name: string; path: string }[]>;
    saveZip(defaultName: string): Promise<string | null>;
  };

  /** 项目媒体的只读 URL（Electron guji-media://；Mock 为相对路径） */
  mediaUrl(projectId: ID, rel: string): string;
}

declare global {
  interface Window {
    guji?: GujiApi;
  }
}

export {};
