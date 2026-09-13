<script lang="ts">
  import { api } from '../lib/api';
  import {
    busy,
    comments,
    currentProjectId,
    folios,
    operator,
    projects,
    shapes,
    steps
  } from '../lib/stores';
  import { guard, toast } from '../lib/toast';
  import { DAMAGE_KINDS, DAMAGE_META } from '@shared/constants';
  import type { ExportPreview } from '@shared/export-preview';
  import type { ExportRecord, ExportResult } from '@shared/types';
  import ExportPreviewModal from '../components/ExportPreviewModal.svelte';

  let includeOriginal = true;
  let previewing = false;
  let exporting = false;
  let preview: ExportPreview | null = null;
  let acknowledged = false;
  /** 预览打开期间使用的选项快照（风险确认后按该选项导出） */
  let previewIncludeOriginal = true;
  let records: ExportRecord[] = [];
  let last: ExportResult | null = null;
  let pid = '';

  currentProjectId.subscribe((v) => {
    pid = v ?? '';
    preview = null;
    last = null;
    records = [];
    acknowledged = false;
    if (v) loadRecords(v);
  });

  $: project = $projects.find((p) => p.id === pid) ?? null;

  async function loadRecords(id: string) {
    const r = await guard(api.archive.records(id), '读取导出记录失败');
    if (r) records = r;
  }

  /** 第一步：拉取导出预览（真实文件校验 + 风险 + 校验清单） */
  async function openPreview() {
    if (!pid) return;
    previewing = true;
    busy.set(true);
    const r = await guard(api.archive.preview(pid, { includeOriginal }), '生成导出预览失败');
    busy.set(false);
    previewing = false;
    if (r) {
      preview = r;
      records = r.records;
      previewIncludeOriginal = includeOriginal;
      acknowledged = false;
      if (!r.canExport) toast('存在阻断性问题，需先处理后才能导出', 'error', 4000);
    }
  }

  function closePreview() {
    if (exporting) return;
    preview = null;
    acknowledged = false;
  }

  /** 第二步：用户确认风险后，生成现有离线报告 zip */
  async function confirmExport() {
    if (!pid || !preview) return;
    exporting = true;
    busy.set(true);
    const r = await guard(
      api.archive.exportProject(pid, {
        includeOriginal: previewIncludeOriginal,
        operator: $operator || project?.author || '修复师'
      }),
      '导出失败'
    );
    busy.set(false);
    exporting = false;
    if (r) {
      last = r;
      toast(`档案已导出：${r.folio_count} 叶，含校验清单`);
      preview = null;
      acknowledged = false;
      await loadRecords(pid);
    } else {
      // 失败：后端已保留可读原因，刷新记录列表以支持“重新导出”
      await loadRecords(pid);
    }
  }

  /** 失败记录上的“重新导出”：重新走一次预览（风险/清单已更新） */
  async function retryExport() {
    await openPreview();
  }

  function fmtTime(iso: string): string {
    return iso.slice(0, 16).replace('T', ' ');
  }

  $: folioRels = Object.fromEntries(
    $folios.map((f) => [f.id, { original: f.original_rel, after: f.after_rel }])
  );

  // 页内摘要仍按当前已加载数据给出概览（权威口径以预览为准）
  $: totalDamage = $shapes.reduce((a, s) => a + s.area_px, 0);
  $: kindCounts = DAMAGE_KINDS.map((k) => [k, $shapes.filter((s) => s.damage === k).length] as [typeof k, number]).filter(
    ([, n]) => n > 0
  );
  $: successCount = records.filter((r) => r.status === 'success').length;
  $: failedCount = records.filter((r) => r.status === 'failed').length;
</script>

<div class="archive-wrap">
  <div class="card summary">
    <h2>修复档案导出</h2>
    {#if project}
      <p class="muted">「{project.name}」 · {project.shelf_no || '无馆藏号'} · {project.era || '年代不详'} · 建档人 {project.author || '—'}</p>
      <div class="metrics">
        <div><b>{$folios.length}</b><span>扫描叶</span></div>
        <div><b>{$shapes.length}</b><span>当前叶标注</span></div>
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
    <button class="btn" on:click={openPreview} disabled={previewing || !pid}>
      {previewing ? '正在汇总…' : '导出预览 → 生成离线档案'}
    </button>
    <p class="muted flow-hint">
      点击后先汇总项目信息、扫描叶、标注、修复方案、工序、批注状态、前后对比图与校验清单，标出归档风险；确认后才生成 zip。
    </p>

    {#if last}
      <div class="done">
        <p>已生成：<code>{last.zip_path}</code></p>
        <p class="muted">
          {(last.bytes / 1024 / 1024).toFixed(2)} MB · {last.folio_count} 叶 · index.html 可离线浏览
          {#if last.operator} · 操作人 {last.operator}{/if}
        </p>
        {#if last.checksum_summary}
          <p class="muted">
            校验摘要：{last.checksum_summary.file_count} 个校验项（原图 {last.checksum_summary.original_matched}/{last.checksum_summary.original_count} sha256 一致，
            对照图 {last.checksum_summary.after_count}）
          </p>
        {/if}
      </div>
    {/if}
  </div>

  <div class="card contents">
    <h3>导出记录（成功 {successCount} · 失败 {failedCount}）</h3>
    {#if records.length === 0}
      <p class="muted">尚无导出记录。导出成功后会保存时间、操作人、档案文件名与校验摘要；失败会保留原因以便重新导出。</p>
    {:else}
      <ul class="records">
        {#each records as r (r.id)}
          <li class={r.status}>
            <div class="r-head">
              <span class="status-tag" class:ok={r.status === 'success'} class:bad={r.status === 'failed'}>
                {r.status === 'success' ? '成功' : '失败'}
              </span>
              <time>{fmtTime(r.created_at)}</time>
              <span class="op">{r.operator || '—'}</span>
            </div>
            {#if r.status === 'success'}
              <p class="file"><code>{r.file_name}</code></p>
              <p class="muted">
                {r.include_original ? '含原图副本' : '不含原图副本'} · {r.folio_count ?? 0} 叶
                {#if r.bytes != null} · {(r.bytes / 1024 / 1024).toFixed(2)} MB{/if}
              </p>
              {#if r.checksum_summary}
                <p class="muted checksum">
                  校验：{r.checksum_summary.file_count} 项 · 原图一致 {r.checksum_summary.original_matched}/{r.checksum_summary.original_count}
                  · 对照图 {r.checksum_summary.after_count}
                  <span title={r.checksum_summary.manifest_sha256}>manifest {r.checksum_summary.manifest_sha256.slice(0, 12)}…</span>
                </p>
              {/if}
            {:else}
              <p class="err">原因：{r.error || '未知错误'}</p>
              <button class="btn tiny secondary" on:click={retryExport}>重新导出</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <h3>zip 内容</h3>
    <pre>
archive/
  index.html        单文件报告（内嵌数据，浏览器直接打开）
  manifest.json     机读清单（项目/叶/图层/标注/版本/工序/批注）
  checksums.txt     全部文件 sha256（原图始终登记，随选项决定是否打包）
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

{#if preview}
  <ExportPreviewModal
    {preview}
    projectId={pid}
    {folioRels}
    bind:includeOriginal={previewIncludeOriginal}
    {exporting}
    bind:acknowledged
    on:close={closePreview}
    on:confirm={confirmExport}
  />
{/if}

<style>
  .archive-wrap {
    display: grid;
    grid-template-columns: minmax(340px, 520px) 1fr;
    gap: 14px;
    padding: 18px 22px;
    align-items: start;
    overflow-y: auto;
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
    margin: 14px 0 6px;
    letter-spacing: 1px;
    color: #6f6150;
  }
  h3:first-child {
    margin-top: 0;
  }
  .muted {
    color: #8a7d6b;
    font-size: 12px;
  }
  .desc {
    font-size: 13px;
    margin-top: 10px;
  }
  .flow-hint {
    margin-top: 8px;
    line-height: 1.6;
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
  .records {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
  }
  .records li {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 8px 10px;
    background: #fffdf8;
  }
  .records li.failed {
    border-color: #e6a89c;
    background: #fcf1ee;
  }
  .r-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .r-head time {
    color: #8a7d6b;
  }
  .r-head .op {
    margin-left: auto;
    color: #6f6150;
  }
  .status-tag {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 99px;
    color: #fff;
    background: #8a7d6b;
  }
  .status-tag.ok {
    background: #2b8a3e;
  }
  .status-tag.bad {
    background: #c92a2a;
  }
  .file {
    margin: 5px 0 2px;
    font-size: 12px;
  }
  .checksum span {
    font-variant-numeric: tabular-nums;
  }
  .err {
    margin: 5px 0 6px;
    font-size: 12px;
    color: #b02a26;
  }
</style>
