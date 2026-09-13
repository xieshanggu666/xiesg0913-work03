/**
 * API 适配：
 *  - Electron 内：window.guji 由 preload 桥接 IPC + guji-media:// 只读协议
 *  - 浏览器 / Playwright：使用同构内存 Mock（localStorage 持久化），并把图片指向 /samples
 */
import type { GujiApi } from '@shared/protocol';
import { buildDashboard } from '@shared/dashboard';
import { buildExportPreview } from '@shared/export-preview';

export const api: GujiApi =
  typeof window !== 'undefined' && window.guji
    ? window.guji
    : createMockApi();

export const isElectron = typeof window !== 'undefined' && !!window.guji;

export function mediaUrl(projectId: string, rel: string | null | undefined): string {
  if (!rel) return '';
  // Electron：guji-media:// 只读协议；Mock：内存媒体表 + 样例映射（见 createMockApi）
  return api.mediaUrl(projectId, rel);
}

function createMockApi(): GujiApi {
  type Row = Record<string, any>;
  const LS_KEY = 'guji-mock-db-v1';
  const load = (): any => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    } catch {
      return {};
    }
  };
  const save = () => localStorage.setItem(LS_KEY, JSON.stringify(db));
  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const now = () => new Date().toISOString();

  let db = load();
  db.projects ||= [];
  db.folios ||= [];
  db.layers ||= [];
  db.shapes ||= [];
  db.samples ||= [];
  db.materials ||= [];
  db.steps ||= [];
  db.versions ||= [];
  db.comments ||= [];
  db.exportRecords ||= [];
  // 上传媒体内容表：rel -> data URL（浏览器拿不到真实文件系统，上传内容随 mock 库持久化）
  db.media ||= {};

  const asyncify = async <T,>(v: T): Promise<T> => {
    save();
    await new Promise((r) => setTimeout(r, 4));
    return v;
  };

  // 与 Electron 端 touchProject 一致：任何项目级写操作都推进项目 updated_at（看板停滞判定依赖它）
  const touchProject = (pid: string | undefined) => {
    const p = db.projects.find((x: Row) => x.id === pid);
    if (p) p.updated_at = now();
  };
  const projectOfFolio = (fid: string): string | undefined =>
    db.folios.find((f: Row) => f.id === fid)?.project_id;

  const defaultLayers = (folioId: string) => [
    { id: uid('lay_'), folio_id: folioId, name: '破损标注', kind: 'damage', color: '#d9480f', visible: true, locked: false, opacity: 0.5, order_index: 0, created_at: now() },
    { id: uid('lay_'), folio_id: folioId, name: '修补方案', kind: 'repair', color: '#2b8a3e', visible: true, locked: false, opacity: 0.5, order_index: 1, created_at: now() },
    { id: uid('lay_'), folio_id: folioId, name: '批注', kind: 'note', color: '#1971c2', visible: true, locked: false, opacity: 0.5, order_index: 2, created_at: now() }
  ];

  const seedIfEmpty = () => {
    if (db.materials.length === 0) {
      db.materials = [
        ['净皮棉连', 'xuan', '#efe6cf', '青檀皮 80% / 沙田稻草 20%', 0.08, 22, 7.4],
        ['仿古色棉连', 'xuan', '#e8d9b8', '青檀皮 60% / 沙田稻草 40%', 0.1, 28, 7.2],
        ['桑皮纸', 'pi', '#f0e2c0', '桑皮 100%', 0.13, 34, 7.0],
        ['构皮棉纸', 'pi', '#ece0bd', '构皮 90%', 0.09, 24, 7.5]
      ].map(([name, category, color_hex, fiber, thickness_mm, weight_gsm, ph]: any) => ({
        id: uid('mat_'), name, category, color_hex, lab: null, fiber, thickness_mm, weight_gsm,
        weave: '帘纹细，吸水性：中', ph, supplier: '内置示例', note: '', created_at: now(), updated_at: now()
      }));
    }
    if (db.samples.length === 0) {
      db.samples = [
        { kind: 'paper', name: '样卷原纸（叶心）', source: '第二叶叶心无墨处', color_hex: '#e7dcc0', fiber: '竹浆约 70% / 皮料 30%', grain: '竖帘纹', thickness_mm: 0.09, absorbency: '中' },
        { kind: 'ink', name: '样卷墨色', source: '第二叶正文浓墨处', color_hex: '#3a342b', fiber: '', grain: '', thickness_mm: null, absorbency: '低' }
      ].map((s: any) => ({
        id: uid('smp_'), project_id: null, lab: null, image_rel: null, note: '',
        created_at: now(), updated_at: now(), ...s
      }));
    }
  };
  seedIfEmpty();

  // 与 Electron 端一致：新版本号 = 该叶全部历史版本的最大号 + 1。
  // 注意 db.versions 按插入顺序排列，首条是最旧记录，取 [0] 会导致连续存版时版本号重复。
  const nextVersion = (rows: Row[]): number => rows.reduce((max, v) => Math.max(max, v.version || 0), 0) + 1;

  // Mock 文件选择：弹出真实 <input type="file">，文件内容读为 data URL 作为 path 返回
  // （浏览器无法访问真实文件系统路径；data URL 会登记进 db.media，mediaUrl 据此展示）
  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const pickLocalImages = (): Promise<{ name: string; path: string }[]> =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.addEventListener('change', async () => {
        const files = Array.from(input.files ?? []);
        resolve(await Promise.all(files.map(async (f) => ({ name: f.name, path: await readAsDataUrl(f) }))));
      });
      input.addEventListener('cancel', () => resolve([]));
      input.click();
    });

  // 与 Electron 端 importAfterImage 一致：从源路径扩展名（或 data URL 的 MIME）推导存储扩展名
  const extOf = (p: string): string => {
    const fromData = /^data:image\/([a-z0-9.+-]+);/i.exec(p)?.[1];
    const fromPath = /\.([a-z0-9]+)$/i.exec(p)?.[1];
    return `.${(fromData ?? fromPath ?? 'png').toLowerCase()}`;
  };

  const area = (g: any): number => {
    if (g.type === 'rect') return (g.w || 0) * (g.h || 0);
    if (g.type === 'ellipse') return Math.PI * ((g.w || 0) / 2) * ((g.h || 0) / 2);
    const pts = g.points || [];
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      s += p.x * q.y - q.x * p.y;
    }
    return Math.abs(s) / 2;
  };

  return {
    app: {
      getDataDir: () => asyncify('(浏览器 Mock 模式：localStorage)'),
      openDataDir: () => asyncify(undefined as any),
      importSamples: async () => {
        let p = db.projects.find((x: Row) => x.shelf_no === 'SAMP-GJ-001');
        if (p) return asyncify({ projectId: p.id, folioCount: db.folios.filter((f: Row) => f.project_id === p.id).length });
        p = {
          id: uid('prj_'),
          name: '《稼轩长短句》样卷（示例）',
          author: '示例资料',
          shelf_no: 'SAMP-GJ-001',
          era: '明刻本（示例）',
          description: '浏览器 Mock 模式下自动生成的样例项目',
          created_at: now(),
          updated_at: now()
        };
        db.projects.push(p);
        const names = ['卷首序', '卷一·第二叶', '卷一·第三叶（虫蛀）'];
        names.forEach((name, i) => {
          const f = {
            id: uid('fol_'),
            project_id: p.id,
            name,
            sequence: i + 1,
            original_rel: `original/sample-${i + 1}.png`,
            original_checksum: 'mock-' + (i + 1),
            width: 900,
            height: 1300,
            thumb_rel: `thumb/sample-${i + 1}.jpg`,
            after_rel: i === 2 ? 'after/sample-3.png' : null,
            after_checksum: i === 2 ? 'mock-after' : null,
            imported_at: now(),
            note: ''
          };
          db.folios.push(f);
          db.layers.push(...defaultLayers(f.id));
          // 与 Electron 端 ensureDefaultLayers 一致：导入即建立 system 空基线版本
          db.versions.push({
            id: uid('ver_'), project_id: p.id, folio_id: f.id, version: 1,
            label: '建档基线', note: '导入扫描时自动建立的空基线', author: 'system',
            snapshot: { layers: db.layers.filter((l: Row) => l.folio_id === f.id), shapes: [] },
            created_at: now()
          });
        });
        const folios = db.folios.filter((f: Row) => f.project_id === p.id);
        const dmgLayer = db.layers.find((l: Row) => l.folio_id === folios[2].id && l.kind === 'damage')!;
        const repLayer = db.layers.find((l: Row) => l.folio_id === folios[2].id && l.kind === 'repair')!;
        const addShape = (layer_id: string, damage: string, geometry: any, label: string) =>
          db.shapes.push({
            id: uid('shp_'), folio_id: folios[2].id, layer_id, damage, geometry, label, note: '',
            area_px: area(geometry), order_index: db.shapes.length + 1, created_at: now()
          });
        addShape(dmgLayer.id, 'wormhole', { type: 'ellipse', x: 430, y: 240, w: 46, h: 38 }, '虫孔群 A');
        addShape(dmgLayer.id, 'wormhole', { type: 'ellipse', x: 560, y: 520, w: 30, h: 26 }, '虫孔 B');
        addShape(dmgLayer.id, 'tear', { type: 'polygon', points: [{ x: 130, y: 160 }, { x: 310, y: 190 }, { x: 320, y: 212 }, { x: 140, y: 184 }] }, '横向撕裂');
        addShape(repLayer.id, 'wormhole', { type: 'ellipse', x: 426, y: 246, w: 54, h: 46 }, '拟用净皮棉连嵌补');
        const mian = db.materials.find((m: Row) => m.name.includes('棉连'));
        [
          { title: '拍照建档与试色', technique: '记录', duration: 30 },
          { title: '干揭分离叶面', technique: '干揭', duration: 45 },
          { title: '虫孔嵌补', technique: '补洞', duration: 90 },
          { title: '整叶托裱压平', technique: '托裱', duration: 60 }
        ].forEach((st, i) => {
          db.steps.push({
            id: uid('stp_'), project_id: p.id, folio_id: folios[2].id, order_index: i + 1,
            title: st.title, technique: st.technique, material_ids: st.title === '虫孔嵌补' && mian ? [mian.id] : [],
            operator: '示例修复', performed_at: now().slice(0, 10), duration_min: st.duration,
            photo_rel: null, note: '', created_at: now()
          });
        });
        db.comments.push(
          { id: uid('cmt_'), project_id: p.id, folio_id: folios[2].id, target_type: 'shape', target_id: null, author: '张老师', body: '虫孔群边缘有旧补纸残留，先做纤维分析。', resolved: false, created_at: now() },
          { id: uid('cmt_'), project_id: p.id, folio_id: null, target_type: 'project', target_id: null, author: '李修复', body: '同意。注意可逆性。', resolved: false, created_at: now() }
        );
        save();
        return { projectId: p.id, folioCount: 3 };
      }
    },

    projects: {
      list: () => asyncify(db.projects),
      create: async (input) =>
        asyncify((() => {
          const p = { id: uid('prj_'), ...input, created_at: now(), updated_at: now() };
          db.projects.push(p);
          return p;
        })()),
      update: async (id, patch) =>
        asyncify(Object.assign(db.projects.find((x: Row) => x.id === id)!, patch, { updated_at: now() })),
      remove: async (id) => {
        db.projects = db.projects.filter((x: Row) => x.id !== id);
        return asyncify(undefined as any);
      },
      stats: async (id) =>
        asyncify({
          folios: db.folios.filter((f: Row) => f.project_id === id).length,
          shapes: db.shapes.filter((s: Row) => db.folios.find((f: Row) => f.id === s.folio_id)?.project_id === id).length,
          damagedAreaPx: db.shapes
            .filter((s: Row) => db.folios.find((f: Row) => f.id === s.folio_id)?.project_id === id)
            .reduce((a: number, s: Row) => a + s.area_px, 0),
          steps: db.steps.filter((s: Row) => s.project_id === id).length,
          comments: db.comments.filter((c: Row) => c.project_id === id).length
        })
    },

    folios: {
      list: async (pid) => asyncify(db.folios.filter((f: Row) => f.project_id === pid)),
      import: async (pid, files) =>
        asyncify(
          files.map((file, i) => {
            const f = {
              id: uid('fol_'),
              project_id: pid,
              name: file.name.replace(/\.[^.]+$/, ''),
              sequence: db.folios.filter((x: Row) => x.project_id === pid).length + i + 1,
              original_rel: `original/${uid('')}.png`,
              original_checksum: uid('sha-'),
              width: 900,
              height: 1300,
              thumb_rel: `thumb/${uid('')}.jpg`,
              after_rel: null,
              after_checksum: null,
              imported_at: now(),
              note: ''
            };
            db.folios.push(f);
            const newLayers = defaultLayers(f.id);
            db.layers.push(...newLayers);
            // 与 Electron 端一致：导入即建立 system 空基线版本
            db.versions.push({
              id: uid('ver_'), project_id: pid, folio_id: f.id, version: 1,
              label: '建档基线', note: '导入扫描时自动建立的空基线', author: 'system',
              snapshot: { layers: newLayers, shapes: [] },
              created_at: now()
            });
            return f;
          })
        ),
      update: async (id, patch) =>
        asyncify(
          (() => {
            const f = Object.assign(db.folios.find((f: Row) => f.id === id)!, patch);
            touchProject(f.project_id);
            return f;
          })()
        ),
      remove: async (id) => {
        const f = db.folios.find((x: Row) => x.id === id);
        db.folios = db.folios.filter((f: Row) => f.id !== id);
        db.layers = db.layers.filter((l: Row) => l.folio_id !== id);
        db.shapes = db.shapes.filter((s: Row) => s.folio_id !== id);
        touchProject(f?.project_id);
        return asyncify(undefined as any);
      },
      setAfterImage: async (id, srcPath) =>
        asyncify((() => {
          const f = db.folios.find((x: Row) => x.id === id)!;
          // 与 Electron 端一致：对照图登记为 after/<folioId><ext>，不覆盖原图；
          // data URL 形式的上传内容登记进媒体表，否则 mediaUrl 只能映射到不存在的样例文件
          const rel = `after/${id}${extOf(srcPath)}`;
          if (srcPath.startsWith('data:')) db.media[rel] = srcPath;
          touchProject(f.project_id);
          return Object.assign(f, { after_rel: rel, after_checksum: uid('sha-') });
        })()),
      averageColor: async () => asyncify({ hex: '#e6d8b0' })
    },

    layers: {
      list: async (fid) => asyncify(db.layers.filter((l: Row) => l.folio_id === fid)),
      create: async (fid, input) =>
        asyncify((() => {
          const l = {
            id: uid('lay_'), folio_id: fid, name: input.name, kind: input.kind, color: input.color,
            visible: true, locked: false, opacity: 0.5,
            order_index: db.layers.filter((l: Row) => l.folio_id === fid).length, created_at: now()
          };
          db.layers.push(l);
          touchProject(projectOfFolio(fid));
          return l;
        })()),
      update: async (id, patch) =>
        asyncify((() => {
          const l = Object.assign(db.layers.find((l: Row) => l.id === id)!, patch);
          touchProject(projectOfFolio(l.folio_id));
          return l;
        })()),
      remove: async (id) => {
        const l = db.layers.find((x: Row) => x.id === id);
        db.layers = db.layers.filter((l: Row) => l.id !== id);
        touchProject(l ? projectOfFolio(l.folio_id) : undefined);
        return asyncify(undefined as any);
      }
    },

    shapes: {
      list: async (fid) => asyncify(db.shapes.filter((s: Row) => s.folio_id === fid)),
      create: async (fid, input) =>
        asyncify((() => {
          const s = {
            id: uid('shp_'), folio_id: fid, layer_id: input.layer_id, damage: input.damage,
            geometry: input.geometry, label: input.label || '', note: input.note || '',
            area_px: area(input.geometry),
            order_index: db.shapes.filter((s: Row) => s.folio_id === fid).length + 1, created_at: now()
          };
          db.shapes.push(s);
          touchProject(projectOfFolio(fid));
          return s;
        })()),
      update: async (id, patch) =>
        asyncify((() => {
          const s = db.shapes.find((x: Row) => x.id === id)!;
          Object.assign(s, patch);
          if (patch.geometry) s.area_px = area(patch.geometry);
          touchProject(projectOfFolio(s.folio_id));
          return s;
        })()),
      remove: async (id) => {
        const s = db.shapes.find((x: Row) => x.id === id);
        db.shapes = db.shapes.filter((s: Row) => s.id !== id);
        touchProject(s ? projectOfFolio(s.folio_id) : undefined);
        return asyncify(undefined as any);
      }
    },

    samples: {
      list: async (kind) => asyncify(kind ? db.samples.filter((s: Row) => s.kind === kind) : db.samples),
      create: async (input) =>
        asyncify((() => {
          const s = { ...input, id: uid('smp_'), created_at: now(), updated_at: now() };
          db.samples.push(s);
          return s;
        })()),
      update: async (id, patch) =>
        asyncify(Object.assign(db.samples.find((s: Row) => s.id === id)!, patch, { updated_at: now() })),
      remove: async (id) => {
        db.samples = db.samples.filter((s: Row) => s.id !== id);
        return asyncify(undefined as any);
      }
    },

    materials: {
      list: async (cat) => asyncify(cat ? db.materials.filter((m: Row) => m.category === cat) : db.materials),
      create: async (input) =>
        asyncify((() => {
          const m = { ...input, id: uid('mat_'), created_at: now(), updated_at: now() };
          db.materials.push(m);
          return m;
        })()),
      update: async (id, patch) =>
        asyncify(Object.assign(db.materials.find((m: Row) => m.id === id)!, patch, { updated_at: now() })),
      remove: async (id) => {
        db.materials = db.materials.filter((m: Row) => m.id !== id);
        return asyncify(undefined as any);
      },
      recommend: async (_sampleId) => {
        return asyncify(
          db.materials
            .filter((m: Row) => m.category !== 'jiang')
            .map((m: Row) => ({
              material: m,
              score: Math.round(60 + Math.random() * 350) / 10,
              reasons: ['浏览器 Mock：按色相符度近似评估', `厚度 ${m.thickness_mm ?? '?'}mm`, `pH ${m.ph ?? '?'}`],
              color_delta_e: null
            }))
            .sort((a: any, b: any) => b.score - a.score)
        );
      }
    },

    steps: {
      list: async (pid) => asyncify(db.steps.filter((s: Row) => s.project_id === pid)),
      create: async (input) =>
        asyncify((() => {
          const s = { ...input, id: uid('stp_'), created_at: now() };
          db.steps.push(s);
          touchProject(input.project_id);
          return s;
        })()),
      update: async (id, patch) =>
        asyncify((() => {
          const s = Object.assign(db.steps.find((s: Row) => s.id === id)!, patch);
          touchProject(s.project_id);
          return s;
        })()),
      remove: async (id) => {
        const s = db.steps.find((x: Row) => x.id === id);
        db.steps = db.steps.filter((s: Row) => s.id !== id);
        touchProject(s?.project_id);
        return asyncify(undefined as any);
      }
    },

    versions: {
      list: async (fid) =>
        asyncify(db.versions.filter((v: Row) => v.folio_id === fid).sort((a: Row, b: Row) => b.version - a.version)),
      save: async (fid, input) =>
        asyncify((() => {
          const list = db.versions.filter((v: Row) => v.folio_id === fid);
          const folio = db.folios.find((f: Row) => f.id === fid);
          const v = {
            id: uid('ver_'), project_id: folio.project_id, folio_id: fid,
            version: nextVersion(list),
            label: input.label, note: input.note, author: input.author,
            snapshot: {
              layers: db.layers.filter((l: Row) => l.folio_id === fid),
              shapes: db.shapes.filter((s: Row) => s.folio_id === fid)
            },
            created_at: now()
          };
          db.versions.push(v);
          touchProject(folio.project_id);
          return v;
        })()),
      restore: async (vid, author) =>
        asyncify((() => {
          const target = db.versions.find((v: Row) => v.id === vid);
          const folio = db.folios.find((f: Row) => f.id === target.folio_id);
          const backup = {
            id: uid('ver_'), project_id: folio.project_id, folio_id: target.folio_id,
            version: nextVersion(db.versions.filter((v: Row) => v.folio_id === target.folio_id)),
            label: `回退至 v${target.version} 前的自动备份`,
            note: '系统在执行版本回退时自动创建',
            author,
            snapshot: {
              layers: db.layers.filter((l: Row) => l.folio_id === target.folio_id),
              shapes: db.shapes.filter((s: Row) => s.folio_id === target.folio_id)
            },
            created_at: now()
          };
          db.versions.push(backup);
          db.layers = db.layers.filter((l: Row) => l.folio_id !== target.folio_id);
          db.shapes = db.shapes.filter((s: Row) => s.folio_id !== target.folio_id);
          db.layers.push(...target.snapshot.layers);
          db.shapes.push(...target.snapshot.shapes);
          touchProject(folio.project_id);
          return target;
        })()),
      snapshot: async (fid) =>
        asyncify({
          layers: db.layers.filter((l: Row) => l.folio_id === fid),
          shapes: db.shapes.filter((s: Row) => s.folio_id === fid)
        })
    },

    comments: {
      list: async (pid) => asyncify(db.comments.filter((c: Row) => c.project_id === pid)),
      create: async (input) =>
        asyncify((() => {
          const c = {
            id: uid('cmt_'), project_id: input.project_id, folio_id: input.folio_id ?? null,
            target_type: input.target_type, target_id: input.target_id ?? null,
            author: input.author, body: input.body, resolved: false, created_at: now()
          };
          db.comments.push(c);
          touchProject(input.project_id);
          return c;
        })()),
      resolve: async (id, resolved) =>
        asyncify((() => {
          const c = Object.assign(db.comments.find((c: Row) => c.id === id)!, { resolved });
          touchProject(c.project_id);
          return c;
        })()),
      remove: async (id) => {
        const c = db.comments.find((x: Row) => x.id === id);
        db.comments = db.comments.filter((c: Row) => c.id !== id);
        touchProject(c?.project_id);
        return asyncify(undefined as any);
      }
    },

    archive: {
      // 与 Electron 端 previewExport 同构：聚合内存库后走共享纯函数。
      // 浏览器无法访问真实文件系统，因此不注入 mediaExists/checksumMatched，
      // 文件类校验项以 warn 呈现（Electron 端会做真实 sha256 比对并可 fail 阻止导出）。
      preview: async (pid, _opts) =>
        asyncify(
          (() => {
            const project = db.projects.find((p: Row) => p.id === pid);
            if (!project) throw new Error(`项目不存在: ${pid}`);
            const folioIds = new Set(db.folios.filter((f: Row) => f.project_id === pid).map((f: Row) => f.id));
            return buildExportPreview({
              project,
              folios: db.folios.filter((f: Row) => f.project_id === pid),
              layers: db.layers.filter((l: Row) => folioIds.has(l.folio_id)),
              shapes: db.shapes.filter((s: Row) => folioIds.has(s.folio_id)),
              steps: db.steps.filter((s: Row) => s.project_id === pid),
              comments: db.comments.filter((c: Row) => c.project_id === pid),
              versions: db.versions.filter((v: Row) => folioIds.has(v.folio_id)),
              records: db.exportRecords.filter((r: Row) => r.project_id === pid)
            });
          })()
        ),
      exportProject: async (pid, opts) =>
        asyncify(
          (() => {
            const project = db.projects.find((p: Row) => p.id === pid);
            if (!project) throw new Error(`项目不存在: ${pid}`);
            const projectFolios = db.folios.filter((f: Row) => f.project_id === pid);
            if (projectFolios.length === 0) {
              // 与 Electron 端一致：空项目是硬性失败，保留可读原因，支持重新导出
              const rec = {
                id: uid('exp_'), project_id: pid, status: 'failed',
                include_original: opts.includeOriginal !== false,
                operator: opts.operator || '修复师', created_at: now(),
                file_name: null, bytes: null, folio_count: null, checksum_summary: null,
                error: '项目尚未导入扫描叶，没有可归档内容'
              };
              db.exportRecords.push(rec);
              throw new Error(rec.error);
            }
            const folioCount = projectFolios.length;
            const fileName = `修复档案-mock-${Date.now()}.zip`;
            const summary = {
              file_count: folioCount * 2 + 1,
              media_count: folioCount * 2,
              original_count: folioCount,
              after_count: projectFolios.filter((f: Row) => f.after_rel).length,
              original_matched: folioCount,
              manifest_sha256: uid('sha-')
            };
            const record = {
              id: uid('exp_'), project_id: pid, status: 'success',
              include_original: opts.includeOriginal !== false,
              operator: opts.operator || project.author || '修复师',
              created_at: now(), file_name: fileName, bytes: 0, folio_count: folioCount,
              checksum_summary: summary, error: null
            };
            db.exportRecords.push(record);
            return {
              zip_path: `(浏览器 Mock：${fileName}；Electron 内产生真实 zip)`,
              bytes: 0,
              folio_count: folioCount,
              checksum_manifest: true,
              record_id: record.id,
              checksum_summary: summary,
              exported_at: record.created_at,
              operator: record.operator
            };
          })()
        ),
      records: async (pid) =>
        asyncify(
          db.exportRecords
            .filter((r: Row) => r.project_id === pid)
            .sort((a: Row, b: Row) => (a.created_at < b.created_at ? 1 : -1))
        )
    },

    dashboard: {
      // 与 Electron 端 projectDashboard 同构：聚合内存库后走同一个共享纯函数
      get: async (pid) =>
        asyncify(
          (() => {
            const project = db.projects.find((p: Row) => p.id === pid);
            if (!project) throw new Error(`项目不存在: ${pid}`);
            const folioIds = new Set(db.folios.filter((f: Row) => f.project_id === pid).map((f: Row) => f.id));
            return buildDashboard({
              project,
              folios: db.folios.filter((f: Row) => f.project_id === pid),
              layers: db.layers.filter((l: Row) => folioIds.has(l.folio_id)),
              shapes: db.shapes.filter((s: Row) => folioIds.has(s.folio_id)),
              steps: db.steps.filter((s: Row) => s.project_id === pid),
              comments: db.comments.filter((c: Row) => c.project_id === pid),
              versions: db.versions.filter((v: Row) => folioIds.has(v.folio_id))
            });
          })()
        )
    },

    dialog: {
      pickImages: async () => pickLocalImages(),
      saveZip: async () => asyncify(null)
    },

    mediaUrl: (_projectId: string, rel: string) => {
      // 上传媒体（修复后对照图等）优先查媒体表；内置样例映射到 public/samples
      if (db.media[rel]) return db.media[rel];
      const file = rel.split('/').pop()!;
      if (rel.startsWith('after/')) {
        // mock 样例第三叶的 after 文件名约定为 <原stem>-after.png
        return `samples/${file.replace(/\.png$/, '-after.png')}`;
      }
      return `samples/${file.replace(/^fol_/, 'sample-').replace('.jpg', '.png')}`;
    }
  };
}
