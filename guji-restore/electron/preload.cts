const { contextBridge, ipcRenderer } = require('electron');

/**
 * preload 仅暴露 namespaced 的调用面；渲染进程拿到的是与浏览器 Mock 同构的 GujiApi。
 */
const ns = (namespace) =>
  new Proxy(
    {},
    {
      get(_t, method) {
        return (...args) => ipcRenderer.invoke(`${namespace}.${String(method)}`, ...args);
      }
    }
  );

contextBridge.exposeInMainWorld('guji', {
  app: ns('app'),
  projects: ns('projects'),
  folios: ns('folios'),
  layers: ns('layers'),
  shapes: ns('shapes'),
  samples: ns('samples'),
  materials: ns('materials'),
  steps: ns('steps'),
  versions: ns('versions'),
  comments: ns('comments'),
  archive: ns('archive'),
  dashboard: ns('dashboard'),
  dialog: ns('dialog'),
  mediaUrl(projectId, rel) {
    const enc = rel
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `guji-media://${projectId}/${enc}`;
  }
});
