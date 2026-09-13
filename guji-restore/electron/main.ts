import { app, BrowserWindow, dialog, ipcMain, protocol, shell, net } from 'electron';
import { pathToFileURL } from 'node:url';
import { join, normalize } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import * as svc from './services/services';
import { exportProjectArchive } from './services/archive';
import { ensureSeeds, importSampleProject } from './services/sample-import';

const isDev = !app.isPackaged;
const DEV_SERVER = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';

let dataDir: string;
let ctx: svc.ServiceContext;
let mainWindow: BrowserWindow | null = null;

if (isDev) {
  process.env.GUJI_RESOURCES_DIR = join(__dirname, '..', 'resources');
} else {
  process.env.GUJI_RESOURCES_DIR = process.resourcesPath;
}

/**
 * guji-media://<projectId>/<rel-path>
 * 渲染进程只能通过该只读 URL 读取项目媒体；自定义协议以 GET 打开、不可回写。
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'guji-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

app.whenReady().then(() => {
  dataDir = process.env.GUJI_DATA_DIR || join(app.getPath('userData'), 'guji-data');
  mkdirSync(dataDir, { recursive: true });
  ctx = new svc.ServiceContext(dataDir);
  ensureSeeds(ctx);
  registerMediaProtocol();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: '古籍修复工作台',
    backgroundColor: '#f6f1e7',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER);
  } else {
    void mainWindow.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html'));
  }
}

/** 只读媒体协议：host = projectId，pathname = 项目目录内相对路径 */
function registerMediaProtocol(): void {
  protocol.handle('guji-media', (request) => {
    const url = new URL(request.url);
    const projectId = url.hostname;
    const rel = normalize(decodeURIComponent(url.pathname.replace(/^\/+/, '')));
    if (!projectId || rel.startsWith('..')) {
      return new Response('Forbidden', { status: 403 });
    }
    const abs = join(ctx.projectDir(projectId), rel);
    if (!existsSync(abs)) return new Response('Not Found', { status: 404 });
    return net.fetch(pathToFileURL(abs).toString());
  });
}

type Handler = (...args: any[]) => unknown;
type FlatHandlers = Record<string, Handler>;

/** 统一 IPC：invoke('namespace.method', ...args) */
function registerIpc(): void {
  const handlers: FlatHandlers = {
    'app.getDataDir': () => dataDir,
    'app.openDataDir': () => void shell.openPath(dataDir),
    'app.importSamples': (operator: string) => importSampleProject(ctx, operator || '修复师'),

    'projects.list': () => svc.listProjects(ctx),
    'projects.create': (input) => svc.createProject(ctx, input),
    'projects.update': (id, patch) => svc.updateProject(ctx, id, patch),
    'projects.remove': (id) => svc.removeProject(ctx, id),
    'projects.stats': (id) => svc.projectStats(ctx, id),

    'folios.list': (projectId) => svc.listFolios(ctx, projectId),
    'folios.import': async (projectId, files) => svc.importFolios(ctx, projectId, files),
    'folios.update': (id, patch) => svc.updateFolio(ctx, id, patch),
    'folios.remove': (id) => svc.removeFolio(ctx, id),
    'folios.setAfterImage': async (folioId, srcPath) => svc.setAfterImage(ctx, folioId, srcPath),
    'folios.averageColor': async (folioId, geo) => svc.folioAverageColor(ctx, folioId, geo),

    'layers.list': (folioId) => svc.listLayers(ctx, folioId),
    'layers.create': (folioId, input) => svc.createLayer(ctx, folioId, input),
    'layers.update': (id, patch) => svc.updateLayer(ctx, id, patch),
    'layers.remove': (id) => svc.removeLayer(ctx, id),

    'shapes.list': (folioId) => svc.listShapes(ctx, folioId),
    'shapes.create': (folioId, input) => svc.createShape(ctx, folioId, input),
    'shapes.update': (id, patch) => svc.updateShape(ctx, id, patch),
    'shapes.remove': (id) => svc.removeShape(ctx, id),

    'samples.list': (kind) => svc.listSamples(ctx, kind),
    'samples.create': (input) => svc.createSample(ctx, input),
    'samples.update': (id, patch) => svc.updateSample(ctx, id, patch),
    'samples.remove': (id) => svc.removeSample(ctx, id),

    'materials.list': (category) => svc.listMaterials(ctx, category),
    'materials.create': (input) => svc.createMaterial(ctx, input),
    'materials.update': (id, patch) => svc.updateMaterial(ctx, id, patch),
    'materials.remove': (id) => svc.removeMaterial(ctx, id),
    'materials.recommend': (sampleId, opts) => svc.recommend(ctx, sampleId, opts?.categoryFilter),

    'steps.list': (projectId) => svc.listSteps(ctx, projectId),
    'steps.create': (input) => svc.createStep(ctx, input),
    'steps.update': (id, patch) => svc.updateStep(ctx, id, patch),
    'steps.remove': (id) => svc.removeStep(ctx, id),

    'versions.list': (folioId) => svc.listVersions(ctx, folioId),
    'versions.save': (folioId, input) => svc.saveVersion(ctx, folioId, input),
    'versions.restore': (versionId, author) => svc.restoreVersion(ctx, versionId, author),
    'versions.snapshot': (folioId) => svc.snapshotOf(ctx, folioId),

    'comments.list': (projectId) => svc.listComments(ctx, projectId),
    'comments.create': (input) => svc.createComment(ctx, input),
    'comments.resolve': (id, resolved) => svc.resolveComment(ctx, id, resolved),
    'comments.remove': (id) => svc.removeComment(ctx, id),

    'archive.exportProject': async (projectId, opts) => {
      const defaultName = `修复档案-${new Date().toISOString().slice(0, 10)}.zip`;
      const destZip =
        dialog.showSaveDialogSync(mainWindow!, {
          title: '导出修复档案',
          defaultPath: join(app.getPath('documents'), defaultName),
          filters: [{ name: 'Zip 档案', extensions: ['zip'] }]
        }) ?? null;
      if (!destZip) throw new Error('已取消导出');
      return exportProjectArchive(ctx, projectId, {
        includeOriginal: opts?.includeOriginal !== false,
        destZip
      });
    },

    'dashboard.get': (projectId) => svc.projectDashboard(ctx, projectId),

    'dialog.pickImages': async () => {
      const r = dialog.showOpenDialogSync(mainWindow!, {
        title: '选择古籍高清扫描图',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '图像', extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp', 'bmp'] }]
      });
      return (r ?? []).map((p) => ({ name: p.split(/[\\/]/).pop() ?? p, path: p }));
    },
    'dialog.saveZip': async (defaultName: string) =>
      dialog.showSaveDialogSync(mainWindow!, {
        title: '保存',
        defaultPath: join(app.getPath('documents'), defaultName),
        filters: [{ name: 'Zip', extensions: ['zip'] }]
      }) ?? null
  };

  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_e, ...args) => fn(...args));
  }
}
