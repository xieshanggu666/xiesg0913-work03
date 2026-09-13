/**
 * 样本库 / 材料库列表区共用的查询逻辑：
 * 分类筛选 + 关键词搜索同时生效，再按名称或更新时间排序。
 * 抽成纯函数便于单元测试，UI 只负责绑定状态。
 */

export type LibrarySortKey = 'updated' | 'name';

export interface LibrarySort {
  key: LibrarySortKey;
  /** true = 升序（A→Z / 旧→新），false = 降序 */
  asc: boolean;
}

export interface LibraryRow {
  name: string;
  created_at: string;
  updated_at?: string;
}

/** 名称排序使用中文拼音排序环境，不可用时退回默认比较 */
const collator =
  typeof Intl !== 'undefined' && 'Collator' in Intl
    ? new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true })
    : null;

export function compareByName(a: string, b: string): number {
  return collator ? collator.compare(a, b) : a.localeCompare(b);
}

/**
 * 在已按分类筛选的列表上应用关键词搜索与排序。
 * @param rows  分类筛选后的行
 * @param query 搜索词（匹配 fields 中任一字段，大小写/全半角不敏感）
 * @param fields 每行参与搜索的文本字段
 * @param sort  排序方式
 */
export function applyLibraryQuery<T extends LibraryRow>(
  rows: T[],
  query: string,
  fields: ((row: T) => string | null | undefined)[],
  sort: LibrarySort
): T[] {
  const q = query.trim().toLocaleLowerCase();
  const filtered = q
    ? rows.filter((row) =>
        fields.some((f) => {
          const v = f(row);
          return !!v && v.toLocaleLowerCase().includes(q);
        })
      )
    : rows.slice();
  const dir = sort.asc ? 1 : -1;
  return filtered.sort((a, b) => {
    const cmp =
      sort.key === 'name'
        ? compareByName(a.name, b.name)
        : (a.updated_at || a.created_at).localeCompare(b.updated_at || b.created_at);
    return cmp * dir;
  });
}
