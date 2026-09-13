# 安装笔记

## 1. 环境要求

- Node.js **20 LTS**（Node 18/22 亦可）与 npm 10+
- 能编译原生模块的工具链：
  - Linux: `python3 make g++`（Debian/Ubuntu: `build-essential`）；sharp 通常下载预编译二进制
  - macOS: Xcode Command Line Tools（`xcode-select --install`）
  - Windows: `windows-build-tools` 或 Visual Studio Build Tools（含 C++ 桌面开发）
- 桌面运行需要图形环境（Windows/macOS/Linux X11/Wayland）。**全程无需联网使用**，仅安装与（可选）electron 下载需要网络。

## 2. 在线机器上安装

```bash
npm install
npm run rebuild      # 关键：为 Electron 的 ABI 重编译 better-sqlite3、sharp
npm run samples      # 生成 resources/samples 下三页仿真古籍（sharp，离线）
npm run dev          # Vite(5173) + Electron
```

生产方式：

```bash
npm run build        # vite build → out/renderer；esbuild → dist-electron/{main,preload}.cjs
npm start           # electron .（无需开发服务器）
```

验证：

```bash
npm test            # vitest 单元测试
npx playwright install chromium   # 仅 e2e 首次需要
npm run test:e2e    # 对 vite build 产物跑无头 Chromium
npm run dist:dir    # electron-builder 解包目录（最快的打包自检）
npm run dist        # AppImage / NSIS 安装包
```

### 为什么必须 `npm run rebuild`

`better-sqlite3` 是原生模块（.node）。npm 安装到的预编译文件对应 **Node 的 ABI**，而 Electron 内置的是另一套 ABI；不重编译，主进程加载时会报 `NODE_MODULE_VERSION mismatch` / `was compiled against a different Node.js version`。

`npm run rebuild` 执行：

```
electron-rebuild -f -w better-sqlite3,sharp
```

打包配置已把二者放入 `asarUnpack`，避免 asar 内加载 .node 失败。

## 3. 完全离线安装（内网机房）

在有网机器（同平台/同 Node 版本）准备：

```bash
npm ci
npm run rebuild
npm run samples
npm run build
npx playwright install chromium     # 只有要跑 e2e 才需要
npm pack 2>/dev/null || true
# 打依赖缓存包
mkdir -p offline && npm install --offline 2>/dev/null || true
tar czf guji-restore-offline.tgz node_modules out dist-electron resources package-lock.json package.json
```

目标机：

```bash
tar xzf guji-restore-offline.tgz
npm run start         # 直接用已重编译的 node_modules
# 或 npm run dist:dir 后运行解包产物
```

若目标机 Node 大版本不同，在目标机用其 Node 头文件重编译：

```bash
npx electron-rebuild -f -w better-sqlite3,sharp
```

也可仅传递 npm 缓存：`~/.npm/_cacache`（Linux）配合 `npm install --offline`，但**仍需在目标 Electron 版本上 rebuild**。

## 4. 数据位置与备份

- Linux: `~/.config/古籍修复工作台/guji-data`
- macOS: `~/Library/Application Support/古籍修复工作台/guji-data`
- Windows: `%APPDATA%\古籍修复工作台\guji-data`

整体复制 `guji-data/` 即可备份/迁移；跨机拷贝后文件内相对路径与只读原图仍一致。
删除项目会一并删除其目录（应用内会二次确认）。

## 5. 常见问题

| 现象 | 处理 |
| --- | --- |
| `NODE_MODULE_VERSION mismatch` | 执行 `npm run rebuild` |
| `sharp` 下载二进制失败 | 设置镜像 `npm config set sharp_binary_host` / `sharp_libvips_binary_host`，或用 `--foreground-scripts` 观察；公司镜像可用 `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install` 并装系统 libvips |
| Linux 启动报缺 `libnss3/libgbm1/libasound2` | 安装 Electron 运行库：`libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2` |
| 无显示环境只想跑测试 | 用 `npm test`、`npm run test:e2e`（无头），不需要 Xvfb |
| 修改了主进程代码但 `npm start` 行为仍旧 | `npm run build`（electron 加载 dist-electron 构建产物；dev 才直连源码） |
| 端口 5173 被占用 | 关掉旧 Vite 或设置 `VITE_DEV_SERVER_URL` |
| 想清空演示数据 | 退出后删除数据目录（见上），重启会重新种入材料库 |

## 6. 样例说明

`resources/samples/` 由 `scripts/gen-samples.mjs` 用 SVG → sharp 合成，**不是真实古籍**：

- `sample-1.png` 卷首序，含版心水痕；
- `sample-2.png` 第二叶，含霉变点；
- `sample-3.png` 第三叶，含虫孔群、横向撕裂、焦斑（预置标注坐标即针对这些合成缺陷）；
- `sample-3-after.png` 第三叶“修复后”（嵌补与补纸可见，用于前后对比）。

导入样例项目走与真实导入完全相同的只读复制通道，便于核对 SHA-256。
