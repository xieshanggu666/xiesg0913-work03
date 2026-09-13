import type { Material, Project, Sample } from '@shared/types';
import { hexToLab } from '@shared/color';

/** 首次启动时写入的修补材料种子库（实际使用中可增删改） */
export function seedMaterials(): Omit<Material, 'id' | 'created_at' | 'updated_at'>[] {
  const m = (
    name: string,
    category: Material['category'],
    color_hex: string,
    fiber: string,
    extra: Partial<Material> = {}
  ): Omit<Material, 'id' | 'created_at' | 'updated_at'> => ({
    name,
    category,
    color_hex,
    lab: hexToLab(color_hex),
    fiber,
    thickness_mm: extra.thickness_mm ?? null,
    weight_gsm: extra.weight_gsm ?? null,
    weave: extra.weave ?? '',
    ph: extra.ph ?? null,
    supplier: extra.supplier ?? '',
    note: extra.note ?? ''
  });
  return [
    m('净皮棉连', 'xuan', '#efe6cf', '青檀皮 80% / 沙田稻草 20%', {
      thickness_mm: 0.08,
      weight_gsm: 22,
      weave: '细密帘纹，吸水性：中',
      ph: 7.4,
      supplier: '泾县宣纸厂',
      note: '薄而绵韧，适合虫孔小洞嵌补'
    }),
    m('仿古色棉连', 'xuan', '#e8d9b8', '青檀皮 60% / 沙田稻草 40%', {
      thickness_mm: 0.1,
      weight_gsm: 28,
      weave: '帘纹较明显，吸水性：中',
      ph: 7.2,
      supplier: '泾县宣纸厂',
      note: '色调偏旧，适合多数明清印本补叶'
    }),
    m('桑皮纸', 'pi', '#f0e2c0', '桑皮 100%', {
      thickness_mm: 0.13,
      weight_gsm: 34,
      weave: '长纤维交织，吸水性：高',
      ph: 7.0,
      supplier: '迁安皮纸作坊',
      note: '纤维长、拉力强，适合大面积托补与撕裂加固'
    }),
    m('构皮棉纸', 'pi', '#ece0bd', '构皮 90% / 粘木纤维 10%', {
      thickness_mm: 0.09,
      weight_gsm: 24,
      weave: '帘纹细，吸水性：中高',
      ph: 7.5,
      supplier: '贵州丹寨',
      note: '柔软耐拉扯，西南皮纸常用'
    }),
    m('云母熟宣（色笺）', 'jian', '#e6dcc4', '青檀皮 / 稻草，云母粉', {
      thickness_mm: 0.12,
      weight_gsm: 32,
      weave: '帘纹，吸水性：低',
      ph: 7.1,
      supplier: '泾县宣纸厂',
      note: '偏熟，适合墨迹密集叶面小面积接补'
    }),
    m('白色绢', 'juan', '#e9e4d6', '桑蚕丝 100%', {
      thickness_mm: 0.11,
      weight_gsm: 38,
      weave: '平纹丝织，吸水性：低',
      ph: 7.0,
      supplier: '苏州丝织',
      note: '绢本书画修裱专用，需做旧处理'
    }),
    m('染旧棉连（普洱茶）', 'mian', '#dcc9a0', '棉浆 / 稻草', {
      thickness_mm: 0.09,
      weight_gsm: 25,
      weave: '吸水性：中',
      ph: 6.9,
      supplier: '自制染色样',
      note: '以茶汁分次染旧，色相随批次微调，建议先做小样'
    }),
    m('小麦淀粉浆糊', 'jiang', '#f3ecd6', '小麦淀粉', {
      thickness_mm: null,
      weight_gsm: null,
      weave: '吸水性：高',
      ph: 6.8,
      supplier: '自制',
      note: '浓度按季节调整；去筋、防腐可逆，传统首选粘接剂'
    })
  ];
}

/** 内置样例项目（对应 resources/samples 下生成的扫描图） */
export function seedProject(): Pick<Project, 'name' | 'author' | 'shelf_no' | 'era' | 'description'> {
  return {
    name: '《稼轩长短句》样卷（内置示例）',
    author: '示例资料',
    shelf_no: 'SAMP-GJ-001',
    era: '明刻本（示例）',
    description: '随应用附带的三页仿真古籍样例，含虫蛀、撕裂、水渍等破损标注，可直接体验全流程。'
  };
}

export function seedSamples(): Omit<Sample, 'id' | 'created_at' | 'updated_at'>[] {
  return [
    {
      project_id: null,
      kind: 'paper',
      name: '样卷原纸（叶心）',
      source: '第二叶叶心无墨处',
      color_hex: '#e7dcc0',
      lab: hexToLab('#e7dcc0'),
      fiber: '竹浆约 70% / 皮料 30%',
      grain: '竖帘纹，丝缕竖向',
      thickness_mm: 0.09,
      absorbency: '中',
      image_rel: null,
      note: '纸面偏黄、有轻微焦斑，纤维短而交织不均'
    },
    {
      project_id: null,
      kind: 'ink',
      name: '样卷墨色',
      source: '第二叶正文浓墨处',
      color_hex: '#3a342b',
      lab: hexToLab('#3a342b'),
      fiber: '',
      grain: '',
      thickness_mm: null,
      absorbency: '低',
      image_rel: null,
      note: '松烟墨，无明显反光'
    }
  ];
}
