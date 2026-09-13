<script lang="ts">
  import { api } from '../lib/api';
  import { busy, comments, currentProjectId, folios, projects, shapes, steps } from '../lib/stores';
  import { guard, toast } from '../lib/toast';
  import { DAMAGE_KINDS, DAMAGE_META } from '@shared/constants';

  let includeOriginal = true;
  let exporting = false;
  let last: { path: string; bytes: number; folios: number } | null = null;
  let pid = '';
  currentProjectId.subscribe((v) => {
    pid = v;
    last = null;
  });

  $: project = $projects.find((p) => p.id === pid) ?? null;

  async function doExport() {
    if (!pid) return;
    exporting = true;
    busy.set(true);
    const r = await guard(api.archive.exportProject(pid, { includeOriginal }), '导出失败');
    busy.set(false);
    exporting = false;
    if (r) {
      last = { path: r.zip_path, bytes: r.bytes, folios: r.folio_count };
      toast(`档案已导出：${r.folio_count} 叶，含校验清单`);
    }
  }

  $: totalDamage = $shapes.reduce((a, s) => a + s.area_px, 0);
  $: kindCounts = DAMAGE_KINDS.map((k) => [k, $shapes.filter((s) => s.damage === k).length] as [typeof k, number]).filter(([, n]) => n > 0);
</script>

<div class="archive-wrap">
  <div class="card summary">
    <h2>修复档案导出</h2>
    {#if project}
      <p class="muted">「{project.name}」 · {project.shelf_no || '无馆藏号'} · {project.era || '年代不详'} · 建档人 {project.author || '—'}</p>
      <div class="metrics">
        <div><b>{$folios.length}</b><span>扫描叶</span></div>
        <div><b>{$shapes.length}</b><span>破损标注</span></div>
        <div><b>{$steps.length}</b><span>工序记录</span></div>
        <div><b>{$comments.length}</b><span>批注</span></div>
        <div><b>{$folios.filter((f) => f.after_rel).length}</b><span>修复后图</span></div>
      </div>
      {#if project.description}<p class="desc">{project.description}</p>{/if}
    {/if}

    <label class="check">
      <input type="checkbox" bind:checked={includeOriginal} />
      包含原图只读副本（否则仅含对照图与缩略图；checksums.txt 始终记录原图 sha256）
    </label>
    <button class="btn" on:click={doExport} disabled={exporting}>
      {exporting ? '正在打包…' : '导出离线档案 zip'}
    </button>

    {#if last}
      <div class="done">
        <p>已生成：<code>{last.path}</code></p>
        <p class="muted">{(last.bytes / 1024 / 1024).toFixed(2)} MB · {last.folios} 叶 · index.html 可离线浏览</p>
      </div>
    {/if}
  </div>

  <div class="card contents">
    <h3>zip 内容</h3>
    <pre>
archive/
  index.html        单文件报告（内嵌数据，浏览器直接打开）
  manifest.json     机读清单（项目/叶/图层/标注/版本/工序/批注）
  checksums.txt     全部文件 sha256（含原图）
  original/…        原图只读副本（与导入时 checksum 一致）
  after/…           修复后对照图
  thumb/…           缩略图</pre>
    <h3>破损构成</h3>
    <ul class="kinds">
      {#each kindCounts as [key, count]}
        <li><i style={`background:${DAMAGE_META[key].color}`}></i>{DAMAGE_META[key].label}<b>{count}</b></li>
      {/each}
    </ul>
    <p class="muted">破损面积合计约 {totalDamage.toLocaleString()} px²（按标注几何估算，仅作工作量参考）。</p>
  </div>
</div>

<style>
  .archive-wrap {
    display: grid;
    grid-template-columns: minmax(340px, 520px) 1fr;
    gap: 14px;
    padding: 18px 22px;
    align-items: start;
  }
  .card {
    padding: 18px 20px;
  }
  h2 {
    font-size: 17px;
    margin-bottom: 8px;
  }
  h3 {
    font-size: 13px;
    margin: 10px 0 6px;
    letter-spacing: 1px;
    color: #6f6150;
  }
  .muted {
    color: #8a7d6b;
    font-size: 12px;
  }
  .desc {
    font-size: 13px;
    margin-top: 10px;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin: 14px 0;
    text-align: center;
  }
  .metrics div {
    background: #f5eddc;
    border-radius: 6px;
    padding: 10px 4px;
  }
  .metrics b {
    display: block;
    font-size: 18px;
  }
  .metrics span {
    font-size: 11px;
    color: #8a7d6b;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    margin: 12px 0;
  }
  .done {
    margin-top: 12px;
    background: #f2ead8;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 12px;
  }
  code {
    word-break: break-all;
  }
  pre {
    background: #f2ead8;
    border-radius: 6px;
    padding: 12px;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
  }
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .kinds li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    background: #f5eddc;
    border-radius: 99px;
    padding: 3px 10px;
  }
  .kinds i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .kinds b {
    color: #6f6150;
  }
</style>
