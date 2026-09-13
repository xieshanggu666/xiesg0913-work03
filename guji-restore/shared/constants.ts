import type { DamageKind, MaterialCategory } from './types.js';

/** 破损类型 → 中文标注与默认配色 */
export const DAMAGE_META: Record<DamageKind, { label: string; color: string }> = {
  wormhole: { label: '虫蛀', color: '#d9480f' },
  tear: { label: '撕裂', color: '#e8590c' },
  mildew: { label: '霉变', color: '#5c940d' },
  missing: { label: '缺损', color: '#c92a2a' },
  stain: { label: '污渍', color: '#86651c' },
  foxing: { label: '焦斑', color: '#b08900' },
  crease: { label: '折痕', color: '#1971c2' },
  watermark: { label: '水痕', color: '#0c8599' },
  inkburn: { label: '烘焦', color: '#7048e8' },
  other: { label: '其他', color: '#868e96' }
};

export const DAMAGE_KINDS = Object.keys(DAMAGE_META) as DamageKind[];

export const MATERIAL_CATEGORY_META: Record<MaterialCategory, string> = {
  xuan: '宣纸',
  mian: '棉纸/棉连',
  pi: '皮纸',
  jian: '笺纸',
  juan: '绢本',
  bu: '补绫布料',
  jiang: '浆糊粘接',
  other: '其他'
};

export const MATERIAL_CATEGORIES = Object.keys(MATERIAL_CATEGORY_META) as MaterialCategory[];

export const LAYER_KIND_META = {
  damage: { label: '破损层', color: '#d9480f' },
  repair: { label: '修补层', color: '#2b8a3e' },
  note: { label: '批注层', color: '#1971c2' }
} as const;

/** 常见古籍修复工艺，供界面下拉 */
export const TECHNIQUES = [
  '干揭',
  '湿揭',
  '淋洗',
  '去污',
  '脱酸',
  '补洞',
  '托裱',
  '镶补',
  '接补',
  '全色',
  '接笔',
  '压平',
  '订线'
] as const;

export const ABSORBENCY_LEVELS = ['低', '中', '高'] as const;

/** 每叶标注数据在版本快照里的初始版本号 */
export const INITIAL_PLAN_VERSION = 1;
