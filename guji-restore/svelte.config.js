// @sveltejs/vite-plugin-svelte 会自动加载本文件。
// vitePreprocess 用 esbuild 处理 <script lang="ts">，无需额外 svelte-preprocess。
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    dev: process.env.NODE_ENV !== 'production'
  }
};
