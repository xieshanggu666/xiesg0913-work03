/** 时间戳前缀的随机 ID，便于按创建顺序排序 */
export function newId(prefix = ''): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${t}${r}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
