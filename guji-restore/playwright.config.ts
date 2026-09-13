import { defineConfig, devices } from '@playwright/test';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 无 root 环境下由 scripts/fetch-chromium-libs.sh 下载到用户目录的 chromium 运行库
const localLibs = [
  join(homedir(), '.local/guji-libs/usr/lib'),
  join(homedir(), '.local/guji-libs/usr/lib/aarch64-linux-gnu'),
  join(homedir(), '.local/guji-libs/lib/aarch64-linux-gnu')
].join(':');
process.env.LD_LIBRARY_PATH = [localLibs, process.env.LD_LIBRARY_PATH ?? ''].filter(Boolean).join(':');

// e2e 直接对 Vite 构建产物 + 内存 Mock API 运行，无需 Electron 显示环境。
export default defineConfig({
  testDir: './tests-e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npx vite preview --outDir out/renderer --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI
  }
});
