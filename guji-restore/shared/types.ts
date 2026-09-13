/**
 * 全局领域模型。主进程 SQLite 持久化、渲染进程 UI、导出档案共用此定义。
 * 所有 ID 使用字符串（时间戳 + 随机），时间统一存 ISO 字符串。
 */

export type ID = string;

export type DamageKind =
  | 'wormhole' // 虫蛀
  | 'tear' // 撕裂/断裂
  | 'mildew' // 霉变
  | 'missing' // 缺叶/缺损
  | 'stain' // 污渍
  | 'foxing' // 焦斑/老化斑
  | 'crease' // 折痕
  | 'watermark' // 水痕
  | 'inkburn' // 烘焦
  | 'other';

export type LayerKind = 'damage' | 'repair' | 'note';

export interface Project {
  id: ID;
  name: string;
  author: string; // 建档人
  shelf_no: string; // 馆藏号 / 书号
  era: string; // 年代
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Folio {
  id: ID;
  project_id: ID;
  name: string; // 叶名，如“卷一·第三叶”
  sequence: number;
  /** 原图只读副本相对数据目录的路径 */
  original_rel: string;
  original_checksum: string; // sha256
  width: number;
  height: number;
  thumb_rel: string;
  after_rel: string | null; // 修复后图像（可更新，不影响原图）
  after_checksum: string | null;
  imported_at: string;
  note: string;
}

export interface Layer {
  id: ID;
  folio_id: ID;
  name: string;
  kind: LayerKind;
  color: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  order_index: number;
  created_at: string;
}

export type GeometryType = 'rect' | 'ellipse' | 'polygon';

export interface Point {
  x: number;
  y: number;
}

export interface Geometry {
  type: GeometryType;
  /** rect / ellipse: x,y 为左上角，w/h 为宽高（图像像素坐标） */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** polygon 顶点 */
  points?: Point[];
}

export interface Shape {
  id: ID;
  folio_id: ID;
  layer_id: ID;
  damage: DamageKind;
  geometry: Geometry;
  label: string;
  note: string;
  area_px: number;
  order_index: number;
  created_at: string;
}

export type SampleKind = 'paper' | 'ink';

export interface LabColor {
  L: number;
  a: number;
  b: number;
}

export interface Sample {
  id: ID;
  project_id: ID | null; // null = 全局样本
  kind: SampleKind;
  name: string;
  source: string; // 取样部位/来源
  color_hex: string;
  lab: LabColor | null;
  fiber: string; // 纤维成分描述，如“檀皮 70% / 稻草 30%”
  grain: string; // 帘纹/丝缕方向
  thickness_mm: number | null;
  absorbency: string; // 吸水性：低/中/高
  image_rel: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export type MaterialCategory =
  | 'xuan' // 宣纸
  | 'mian' // 棉纸/棉连
  | 'pi' // 皮纸
  | 'jian' // 笺纸
  | 'juan' // 绢本
  | 'bu' // 补绫/布料
  | 'jiang' // 浆糊/粘接剂
  | 'other';

export interface Material {
  id: ID;
  name: string;
  category: MaterialCategory;
  color_hex: string;
  lab: LabColor | null;
  fiber: string;
  thickness_mm: number | null;
  weight_gsm: number | null;
  weave: string; // 纹理/帘纹
  ph: number | null;
  supplier: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface RestorationStep {
  id: ID;
  project_id: ID;
  folio_id: ID | null; // null = 整卷级工序
  order_index: number;
  title: string;
  technique: string; // 工艺，如“干揭 / 湿揭 / 托裱”
  material_ids: ID[];
  operator: string;
  performed_at: string; // 实际施作日期
  duration_min: number | null;
  photo_rel: string | null;
  note: string;
  created_at: string;
}

/** 方案版本快照内容 */
export interface PlanSnapshot {
  layers: Layer[];
  shapes: Shape[];
}

export interface PlanVersion {
  id: ID;
  project_id: ID;
  folio_id: ID;
  version: number;
  label: string;
  note: string;
  author: string;
  snapshot: PlanSnapshot; // 数据库内以 JSON 文本存储
  created_at: string;
}

export type CommentTarget = 'project' | 'folio' | 'shape' | 'step' | 'version';

export interface Comment {
  id: ID;
  project_id: ID;
  folio_id: ID | null;
  target_type: CommentTarget;
  target_id: ID | null;
  author: string;
  body: string;
  resolved: boolean;
  created_at: string;
}

/** 材料推荐结果 */
export interface Recommendation {
  material: Material;
  score: number; // 0..100
  /** 扣分/加分理由，便于修复师判断，而不是黑盒结论 */
  reasons: string[];
  color_delta_e: number | null;
}

/** 校验摘要：导出成功后随导出记录留痕，便于事后核对档案内容 */
export interface ChecksumSummary {
  /** checksums.txt 行数（每个被打包/登记的文件一行） */
  file_count: number;
  /** 媒体文件数（原图/修复后图/缩略图/工序照片） */
  media_count: number;
  /** 原图副本数：无论是否打包原图，都参与 sha256 登记与比对 */
  original_count: number;
  /** 修复后对照图数 */
  after_count: number;
  /** 原图实测 sha256 与入库 original_checksum 一致的叶数 */
  original_matched: number;
  /** manifest.json 自身的 sha256（与 checksums.txt 末行一致） */
  manifest_sha256: string;
}

export interface ExportResult {
  zip_path: string;
  bytes: number;
  folio_count: number;
  checksum_manifest: boolean;
  /** 本次导出写入的记录 ID */
  record_id?: ID;
  /** 校验摘要 */
  checksum_summary?: ChecksumSummary;
  exported_at?: string;
  operator?: string;
}

/** 一次导出尝试的留痕记录（成功或失败都保存，失败可据此重新导出） */
export interface ExportRecord {
  id: ID;
  project_id: ID;
  status: 'success' | 'failed';
  /** 用户确认导出时勾选的选项 */
  include_original: boolean;
  /** 操作人（取顶栏修复师署名） */
  operator: string;
  created_at: string;
  /** 成功：档案 zip 的绝对路径；失败/取消为 null */
  file_name: string | null;
  /** 成功：zip 字节数 */
  bytes: number | null;
  /** 成功：叶数 */
  folio_count: number | null;
  /** 成功：校验摘要；失败为 null */
  checksum_summary: ChecksumSummary | null;
  /** 失败时保留的可读原因；成功为 null */
  error: string | null;
}
