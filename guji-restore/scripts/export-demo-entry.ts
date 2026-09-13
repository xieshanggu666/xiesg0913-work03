// 由 scripts/export-demo.mjs 经 esbuild 打包后执行：导出内置样例的修复档案 zip。
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as svc from '../electron/services/services';
import { exportProjectArchive } from '../electron/services/archive';
import { importSampleProject } from '../electron/services/sample-import';

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'guji-demo-'));
  const ctx = new svc.ServiceContext(dataDir);
  const { projectId } = await importSampleProject(ctx, '修复师');
  const zip = join(dataDir, 'demo-archive.zip');
  const r = exportProjectArchive(ctx, projectId, { includeOriginal: true, destZip: zip });
  console.log(JSON.stringify(r, null, 2));
  console.log('DATADIR=' + dataDir);
}

void main();
