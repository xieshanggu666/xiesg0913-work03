import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';

// 渲染进程构建：输出到 out/renderer，由 electron 主进程以 file:// 加载
export default defineConfig({
  plugins: [svelte()],
  base: './',
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url))
    }
  },
  build: {
    outDir: 'out/renderer',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
