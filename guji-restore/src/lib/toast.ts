import { writable } from 'svelte/store';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export const toasts = writable<Toast[]>([]);
let seq = 1;

export function toast(text: string, kind: Toast['kind'] = 'info', ms = 2600): void {
  const id = seq++;
  toasts.update((t) => [...t, { id, text, kind }]);
  setTimeout(() => toasts.update((t) => t.filter((x) => x.id !== id)), ms);
}

/** 统一错误提示包装 */
export async function guard<T>(p: Promise<T>, errorText = '操作失败'): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    toast(`${errorText}：${(e as Error).message}`, 'error');
    return null;
  }
}
