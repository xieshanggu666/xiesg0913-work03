// 并行启动 Vite dev server 与 Electron；Vite 就绪后再拉起 Electron。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);

async function waitForVite(url, timeoutMs = 30_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* 尚未就绪 */
    }
    await sleep(250);
  }
  throw new Error('Vite dev server 启动超时');
}

const mode = process.argv[2] || 'dev';
const url = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';

// 先构建 electron（保证 preload 存在）
const buildElectron = mode === 'electron-only' ? [] : [run('node', ['scripts/build-electron.mjs'])];
if (mode !== 'electron-only') {
  await Promise.all(buildElectron);
  const vite = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'],
    { stdio: 'inherit' }
  );
  await waitForVite(url);
  if (mode === 'build') {
    // 仅预热，不启动 electron
    vite.kill();
    process.exit(0);
  }
  const electron = spawn(require('electron'), ['.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url }
  });
  electron.on('exit', (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (c) => (c ? reject(new Error(`${cmd} 退出码 ${c}`)) : resolve()));
  });
}
