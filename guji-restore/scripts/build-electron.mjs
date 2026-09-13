// 用 esbuild 把 electron 主进程/preload 打成 CJS，外部依赖保持 require 解析
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'dist-electron'), { recursive: true });

const common = {
  bundle: true,
  absWorkingDir: root,
  alias: { '@shared': resolve(root, 'shared') },
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: ['electron', 'better-sqlite3', 'sharp', 'adm-zip']
};

await build({
  ...common,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs'
});
await build({
  ...common,
  entryPoints: ['electron/preload.cts'],
  outfile: 'dist-electron/preload.cjs'
});

console.log('electron build → dist-electron/');
