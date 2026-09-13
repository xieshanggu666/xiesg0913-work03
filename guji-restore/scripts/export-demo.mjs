// 生成内置样例项目并导出修复档案 zip（用于检查离线 HTML 报告）。
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'scripts', '.export-demo.cjs');
await build({
  entryPoints: [join(root, 'scripts', 'export-demo-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  absWorkingDir: root,
  alias: { '@shared': join(root, 'shared') },
  external: ['better-sqlite3', 'sharp', 'adm-zip'],
  logLevel: 'warning'
});
require(outfile);
rmSync(outfile, { force: true });
