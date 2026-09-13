import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import type { ChecksumSummary, ExportRecord, ExportResult, ID } from '@shared/types';
import { DAMAGE_META, MATERIAL_CATEGORY_META } from '@shared/constants';
import { newId, nowIso } from '@shared/id';
import { buildExportPreview, type ExportPreview } from '@shared/export-preview';
import * as repo from '../db/repo';
import type { ServiceContext } from './services';

/**
 * 导出修复档案（zip，离线可打开）：
 *   archive/
 *     index.html            独立报告：单文件、内嵌数据，无网络也能在浏览器查看
 *     manifest.json         机读清单
 *     checksums.txt         全部文件 sha256（原图始终登记校验；仅在勾选时打包原图）
 *     original/<...>        原图只读副本（可在导出时选择不含）
 *     after/<...>           修复后对照图
 *     thumb/<...>           缩略图
 *
 * 导出流程：先由 previewExport 生成「导出预览」，用户在界面确认风险后才调用本函数；
 * 成功写入 export_records（时间/操作人/文件名/校验摘要），失败由服务层记录可读原因。
 */
export function exportProjectArchive(
  ctx: ServiceContext,
  projectId: ID,
  opts: { includeOriginal: boolean; destZip: string; operator?: string }
): ExportResult {
  const lib = ctx.library();
  const project = repo.getProject(lib, projectId);
  if (!project) throw new Error(`项目不存在: ${projectId}`);
  const db = ctx.projectDb(projectId);
  const pdir = ctx.projectDir(projectId);

  const folios = repo.listFolios(db);
  if (folios.length === 0) throw new Error('项目尚未导入扫描叶，没有可归档内容');
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
    operator: opts.operator || project.author || '',
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

  // 原图：必须存在、sha256 必须与入库一致；无论是否打包都登记进 checksums.txt
  const checksumLines: string[] = [];
  let mediaCount = 0;
  let afterCount = 0;
  let originalMatched = 0;

  const requireMedia = (rel: string, label: string) => {
    const abs = join(pdir, rel);
    if (!existsSafe(abs)) throw new Error(`${label}缺失，导出中止：${rel}`);
    return abs;
  };
  const hashOf = (abs: string) => createHash('sha256').update(readFileSync(abs)).digest('hex');

  for (const f of folios) {
    // 原图：只读副本丢失 / 校验不一致都是硬性失败（预览清单已标 fail 并阻止导出）
    const origAbs = requireMedia(f.original_rel, '原图只读副本');
    const origHash = hashOf(origAbs);
    if (origHash !== f.original_checksum) {
      throw new Error(`「${f.name}」原图 sha256 与入库记录不一致，导出中止（疑似副本被改动）`);
    }
    originalMatched += 1;
    checksumLines.push(`${origHash}  ${f.original_rel}`);
    mediaCount += 1;
    if (opts.includeOriginal) {
      zip.addLocalFile(origAbs, f.original_rel.split('/').slice(0, -1).join('/'));
    }

    // 缩略图：报告必需
    const thumbAbs = requireMedia(f.thumb_rel, '缩略图');
    checksumLines.push(`${hashOf(thumbAbs)}  ${f.thumb_rel}`);
    mediaCount += 1;
    zip.addLocalFile(thumbAbs, f.thumb_rel.split('/').slice(0, -1).join('/'));

    // 修复后图：可选（缺失由预览标风险，不阻止导出）
    if (f.after_rel) {
      const abs = join(pdir, f.after_rel);
      if (existsSafe(abs)) {
        checksumLines.push(`${hashOf(abs)}  ${f.after_rel}`);
        mediaCount += 1;
        afterCount += 1;
        zip.addLocalFile(abs, f.after_rel.split('/').slice(0, -1).join('/'));
      }
    }
  }
  for (const s of steps) {
    if (!s.photo_rel) continue;
    const abs = join(pdir, s.photo_rel);
    if (!existsSafe(abs)) continue;
    checksumLines.push(`${hashOf(abs)}  ${s.photo_rel}`);
    mediaCount += 1;
    zip.addLocalFile(abs, s.photo_rel.split('/').slice(0, -1).join('/'));
  }

  const manifestSha = sha256Text(manifestText);
  checksumLines.push(`${manifestSha}  manifest.json`);
  zip.addFile('checksums.txt', Buffer.from(checksumLines.join('\n') + '\n', 'utf8'));

  zip.writeZip(opts.destZip);

  const summary: ChecksumSummary = {
    file_count: checksumLines.length,
    media_count: mediaCount,
    original_count: folios.length,
    after_count: afterCount,
    original_matched: originalMatched,
    manifest_sha256: manifestSha
  };

  const result: ExportResult = {
    zip_path: opts.destZip,
    bytes: statSync(opts.destZip).size,
    folio_count: folios.length,
    checksum_manifest: true,
    checksum_summary: summary,
    exported_at: nowIso(),
    operator: opts.operator || project.author || ''
  };

  // 成功留痕：导出时间、操作人、档案文件名、校验摘要
  const record: ExportRecord = {
    id: newId('exp_'),
    project_id: projectId,
    status: 'success',
    include_original: opts.includeOriginal,
    operator: result.operator!,
    created_at: result.exported_at!,
    file_name: opts.destZip,
    bytes: result.bytes,
    folio_count: folios.length,
    checksum_summary: summary,
    error: null
  };
  repo.insertExportRecord(db, record);
  result.record_id = record.id;
  return result;
}

/**
 * 导出预览：聚合项目全部数据 + 真实文件校验，生成汇总、风险与校验清单（不落库）。
 * 主进程注入磁盘上的媒体存在性与原图 sha256 比对结果。
 */
export function previewExport(
  ctx: ServiceContext,
  projectId: ID,
  opts: { includeOriginal: boolean }
): ExportPreview {
  void opts; // 原图是否打包不影响预览的风险/清单口径（checksums 始终登记原图）
  const project = repo.getProject(ctx.library(), projectId);
  if (!project) throw new Error(`项目不存在: ${projectId}`);
  const db = ctx.projectDb(projectId);
  const pdir = ctx.projectDir(projectId);
  const folios = repo.listFolios(db);

  const mediaRels = new Set<string>();
  for (const f of folios) {
    mediaRels.add(f.original_rel);
    mediaRels.add(f.thumb_rel);
    if (f.after_rel) mediaRels.add(f.after_rel);
  }
  const steps = repo.listSteps(db, projectId);
  for (const s of steps) if (s.photo_rel) mediaRels.add(s.photo_rel);

  const mediaExists = new Map<string, boolean>();
  for (const rel of mediaRels) mediaExists.set(rel, existsSafe(join(pdir, rel)));

  const checksumMatched = new Map<ID, boolean>();
  for (const f of folios) {
    const abs = join(pdir, f.original_rel);
    if (!existsSafe(abs)) {
      checksumMatched.set(f.id, false);
      continue;
    }
    checksumMatched.set(
      f.id,
      createHash('sha256').update(readFileSync(abs)).digest('hex') === f.original_checksum
    );
  }

  return buildExportPreview({
    project,
    folios,
    layers: (db.prepare('SELECT * FROM layers').all() as any[]).map(repo.layerRow),
    shapes: (db.prepare('SELECT * FROM shapes').all() as any[]).map(repo.shapeRow),
    steps,
    comments: repo.listComments(db, projectId),
    versions: (db.prepare('SELECT * FROM plan_versions').all() as any[]).map(repo.versionRow),
    records: repo.listExportRecords(db, projectId),
    mediaExists,
    checksumMatched
  });
}

/** 导出失败留痕：保留可读原因，界面据此提供“重新导出” */
export function recordExportFailure(
  ctx: ServiceContext,
  projectId: ID,
  info: { includeOriginal: boolean; operator: string; error: string }
): ExportRecord {
  const project = repo.getProject(ctx.library(), projectId);
  if (!project) throw new Error(`项目不存在: ${projectId}`);
  const db = ctx.projectDb(projectId);
  const record: ExportRecord = {
    id: newId('exp_'),
    project_id: projectId,
    status: 'failed',
    include_original: info.includeOriginal,
    operator: info.operator,
    created_at: nowIso(),
    file_name: null,
    bytes: null,
    folio_count: null,
    checksum_summary: null,
    error: info.error
  };
  repo.insertExportRecord(db, record);
  return record;
}

export function listExportRecords(ctx: ServiceContext, projectId: ID): ExportRecord[] {
  return repo.listExportRecords(ctx.projectDb(projectId), projectId);
}

function existsSafe(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
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
<div class="sub">导出时间：${data.exported_at}${data.operator ? '　导出操作人：' + escape(data.operator) : ''}（离线档案 · 校验见 checksums.txt）</div></header>
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
else html += '<section><h2>修复前后对比</h2><p class="muted">本档案未包含修复后对照图。</p></section>';
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
