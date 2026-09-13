import { describe, expect, it } from 'vitest';
import { applyLibraryQuery, type LibraryRow } from '../../shared/list-query';

interface Row extends LibraryRow {
  kind: string;
  source: string;
  note: string;
}

const rows: Row[] = [
  { kind: 'paper', name: '桑皮纸', source: '库房甲 A', note: '', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-03-01T00:00:00.000Z' },
  { kind: 'paper', name: '竹浆纸', source: '库房乙', note: '纤维粗', created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z' },
  { kind: 'ink', name: '松烟墨', source: '库房甲', note: '', created_at: '2026-01-15T00:00:00.000Z', updated_at: '2026-04-01T00:00:00.000Z' }
];

const name = (r: Row) => r.name;
const source = (r: Row) => r.source;
const note = (r: Row) => r.note;

describe('applyLibraryQuery', () => {
  it('无搜索词时返回全部（按更新时间降序）', () => {
    const out = applyLibraryQuery(rows, '', [name], { key: 'updated', asc: false });
    expect(out.map((r) => r.name)).toEqual(['松烟墨', '桑皮纸', '竹浆纸']);
  });

  it('关键词大小写不敏感、忽略首尾空白，匹配任一指定字段', () => {
    expect(applyLibraryQuery(rows, ' 库房甲 ', [name, source], { key: 'name', asc: true }).map((r) => r.name)).toEqual(['桑皮纸', '松烟墨']);
    expect(applyLibraryQuery(rows, ' A ', [name, source], { key: 'name', asc: true }).map((r) => r.name)).toEqual(['桑皮纸']);
    expect(applyLibraryQuery(rows, '纤维', [name, note], { key: 'name', asc: true }).map((r) => r.name)).toEqual(['竹浆纸']);
  });

  it('名称升/降序排序（中文按拼音）', () => {
    // 拼音：桑 sang → 松 song → 竹 zhu
    const asc = applyLibraryQuery(rows, '', [name], { key: 'name', asc: true }).map((r) => r.name);
    expect(asc).toEqual(['桑皮纸', '松烟墨', '竹浆纸']);
    const desc = applyLibraryQuery(rows, '', [name], { key: 'name', asc: false }).map((r) => r.name);
    expect(desc).toEqual(['竹浆纸', '松烟墨', '桑皮纸']);
  });

  it('更新时间升/降序，缺 updated_at 时回退 created_at', () => {
    const withLegacy = rows.map((r, i) =>
      i === 1 ? { ...r, updated_at: undefined as unknown as string } : r
    );
    const asc = applyLibraryQuery(withLegacy, '', [name], { key: 'updated', asc: true }).map((r) => r.name);
    expect(asc).toEqual(['竹浆纸', '桑皮纸', '松烟墨']);
    const desc = applyLibraryQuery(withLegacy, '', [name], { key: 'updated', asc: false }).map((r) => r.name);
    expect(desc).toEqual(['松烟墨', '桑皮纸', '竹浆纸']);
  });

  it('无匹配返回空数组（由 UI 给出空结果提示）', () => {
    expect(applyLibraryQuery(rows, '不存在的东西', [name, source, note], { key: 'name', asc: true })).toEqual([]);
  });

  it('搜索词首尾空白被忽略', () => {
    expect(applyLibraryQuery(rows, '   ', [name], { key: 'name', asc: true })).toHaveLength(3);
  });
});
