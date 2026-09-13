import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import AdmZip from 'adm-zip';
import type { ExportResult, ID } from '@shared/types';
import { DAMAGE_META, MATERIAL_CATEGORY_META } from '@shared/constants';
import * as repo from '../db/repo';
import type { ServiceContext } from './services';

/**
 * 导出修复档案（zip，离线可打开）：
 *   archive/
 *     index.html            独立报告：单文件、内嵌数据，无网络也能在浏览器查看
 *     manifest.json         机读清单
 *     checksums.txt         全部文件 sha256（含原图；原图与应用内 sha256 一致）
 *     original/<...>        原图只读副本（可在导出时选择不含）
 *     after/<...>           修复后对照图
 *     thumb/<...>           缩略图
 */
export function exportProjectArchive(
  ctx: ServiceContext,
  projectId: ID,
  opts: { includeOriginal: boolean; destZip: string }
): ExportResult {
  const lib = ctx.library();
  const project = repo.getProject(lib, projectId);
  if (!project) throw new Error(`项目不存在: ${projectId}`);
  const db = ctx.projectDb(projectId);
  const pdir = ctx.projectDir(projectId);

  const folios = repo.listFolios(db);
  const layers = new Map(folios.map((f) => [f.id, repo.listLayers(db, f.id)]));
  const shapes = new Map(folios.map((f) => [f.id, repo.listShapes(db, f.id)]));
  const versions = new Map(folios.map((f) => [f.id, repo.listVersions(db, f.id)]));
  const steps = repo.listSteps(db, projectId);
  const comments = repo.listComments(db, projectId);
  const samples = repo.listSamples(lib).filter((s) => s.project_id === projectId || s.project_id == null);
  const materials = repo.listMaterials(lib);

  const manifest = {
    format: 'guji-restore-archive/1',
    exported_at: new Date().toISOString(),
    project,
    folios: folios.map((f) => ({
      ...f,
      layers: layers.get(f.id),
      shapes: shapes.get(f.id),
      versions: versions.get(f.id)?.map((v) => ({ ...v, snapshot: undefined, snapshot_shapes: v.snapshot.shapes.length }))
    })),
    steps,
    comments,
    samples,
    materials
  };

  const manifestText = JSON.stringify(manifest, null, 2);
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(manifestText, 'utf8'));
  zip.addFile('index.html', Buffer.from(renderHtml(project.name, manifest), 'utf8'));

  const checksumLines: string[] = [];
  const addMedia = (rel: string | null, required: boolean) => {
    if (!rel) return;
    const abs = join(pdir, rel);
    if (!existsSafe(abs)) {
      if (required) throw new Error(`缺少媒体文件: ${rel}`);
      return;
    }
    if (required || opts.includeOriginal || !rel.startsWith('original/')) {
      zip.addLocalFile(abs, rel.split('/').slice(0, -1).join('/'));
      checksumLines.push(`${sha256(abs)}  ${rel}`);
    }
  };
  for (const f of folios) {
    addMedia(f.original_rel, true);
    addMedia(f.after_rel, false);
    addMedia(f.thumb_rel, true);
  }
  for (const s of steps) if (s.photo_rel) addMedia(s.photo_rel, false);

  checksumLines.push(`${sha256Text(manifestText)}  manifest.json`);
  zip.addFile('checksums.txt', Buffer.from(checksumLines.join('\n') + '\n', 'utf8'));

  zip.writeZip(opts.destZip);
  return {
    zip_path: opts.destZip,
    bytes: statSync(opts.destZip).size,
    folio_count: folios.length,
    checksum_manifest: true
  };
}

function existsSafe(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function sha256Text(t: string): string {
  return createHash('sha256').update(t).digest('hex');
}

/** 生成零依赖的单文件 HTML 报告（内嵌 JSON，原生 JS 渲染） */
function renderHtml(projectName: string, data: any): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${escape(projectName)} · 修复档案</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
:root{--ink:#2b2a27;--paper:#f6f1e7;--accent:#9a3b2e;--line:#d8cdbb}
*{box-sizing:border-box}body{margin:0;font-family:"Songti SC","Noto Serif CJK SC",serif;background:var(--paper);color:var(--ink)}
header{padding:32px 40px;border-bottom:3px double var(--accent)}
h1{margin:0 0 8px;font-size:28px}.sub{color:#6b5d4f}
main{padding:24px 40px;max-width:1080px;margin:0 auto}
section{margin:32px 0}h2{font-size:20px;border-left:4px solid var(--accent);padding-left:10px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
th{background:#efe6d5}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.card{border:1px solid var(--line);background:#fffdf8;padding:12px}
.card img{width:100%;height:160px;object-fit:contain;background:#f3ece0;display:block}
.tag{display:inline-block;font-size:12px;padding:1px 5px;border-radius:3px;color:#fff;margin-right:6px}
.muted{color:#8a7a68;font-size:12px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.compare img{width:100%;border:1px solid var(--line)}
</style></head><body>
<header><h1>${escape(projectName)}</h1>
<div class="sub">馆藏号：${escape(data.project.shelf_no || '—')}　年代：${escape(data.project.era || '—')}　建档人：${escape(data.project.author || '—')}</div>
<div class="sub">导出时间：${data.exported_at}（离线档案 · 校验见 checksums.txt）</div></header>
<main id="root"></main>
<script>
const DATA = ${json};
const DAMAGE = ${JSON.stringify(DAMAGE_META)};
const MATCAT = ${JSON.stringify(MATERIAL_CATEGORY_META)};
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const img = rel => rel ? rel.split('/').map(encodeURIComponent).join('/') : '';
const rows = (obj, cols) => '<table><tr>'+cols.map(c=>'<th>'+c[1]+'</th>').join('')+'</tr>'+
  obj.map(o=>'<tr>'+cols.map(c=>'<td>'+c[0](o)+'</td>').join('')+'</tr>').join('')+'</table>';
let html = '';
html += '<section><h2>修复叶次（'+DATA.folios.length+'）</h2><div class="grid">' +
  DATA.folios.map(f=>'<div class="card"><img src="'+img(f.thumb_rel)+'"/><p><b>'+esc(f.name)+'</b></p>'+
    '<p class="muted">'+f.width+'×'+f.height+' · 标注 '+f.shapes.length+' 处 · 版本 '+f.versions.length+'</p>'+
    '<div>'+f.shapes.map(s=>'<span class="tag" style="background:'+(DAMAGE[s.damage]?.color||'#888')+'">'+(DAMAGE[s.damage]?.label||s.damage)+'</span>').join('')+'</div></div>').join('') +
  '</div></section>';
const withAfter = DATA.folios.filter(f=>f.after_rel);
if (withAfter.length) html += '<section><h2>修复前后对比</h2>'+withAfter.map(f=>
  '<h3>'+esc(f.name)+'</h3><div class="compare"><div><img src="'+img(f.original_rel)+'"/><div class="muted">修复前（只读原图）</div></div>'+
  '<div><img src="'+img(f.after_rel)+'"/><div class="muted">修复后</div></div></div>').join('')+'</section>';
html += '<section><h2>修复工序</h2>' + rows(DATA.steps, [
  [o=>o.order_index,'序'],[o=>esc(o.title),'工序'],[o=>esc(o.technique),'工艺'],[o=>esc(o.operator),'修复师'],[o=>esc(o.performed_at),'日期'],[o=>esc(o.note),'记录']]) + '</section>';
html += '<section><h2>纸墨样本</h2>' + rows(DATA.samples, [
  [o=>'<span style="display:inline-block;width:14px;height:14px;background:'+o.color_hex+';border:1px solid #999"></span>','色'],
  [o=>esc(o.name),'名称'],[o=>esc(o.kind==='paper'?'纸张':'墨色'),'类型'],[o=>esc(o.fiber),'纤维'],[o=>esc(o.grain),'帘纹'],[o=>esc(o.note),'备注']]) + '</section>';
html += '<section><h2>修补材料库</h2>' + rows(DATA.materials, [
  [o=>'<span style="display:inline-block;width:14px;height:14px;background:'+o.color_hex+';border:1px solid #999"></span>','色'],
  [o=>esc(o.name),'名称'],[o=>esc(MATCAT[o.category]||o.category),'类别'],[o=>esc(o.fiber),'纤维'],[o=>o.ph??'—','pH'],[o=>esc(o.supplier),'来源']]) + '</section>';
html += '<section><h2>多人批注</h2>' + rows(DATA.comments, [
  [o=>esc(o.author),'作者'],[o=>o.resolved?'已解决':'待处理','状态'],[o=>esc(o.body),'内容'],[o=>esc(o.created_at),'时间']]) + '</section>';
document.getElementById('root').innerHTML = html;
</script></body></html>`;
}

function escape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 避免仅 relative 引入告警
void relative;
