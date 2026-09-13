<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ExportPreview } from '@shared/export-preview';
  import { mediaUrl } from '../lib/api';

  export let preview: ExportPreview;
  export let projectId: string;
  /** folioId -> { original, after } 媒体相对路径（由父组件从 folios store 注入） */
  export let folioRels: Record<string, { original: string; after: string | null }> = {};
  export let includeOriginal = true;
  export let exporting = false;
  /** 用户是否已确认风险（有风险时需先勾选确认） */
  export let acknowledged = false;

  const dispatch = createEventDispatcher<{ close: void; confirm: void }>();

  const RISK_META = {
    'missing-after-image': { label: '缺修复后图', color: '#e8890c' },
    'unresolved-comments': { label: '未解决批注', color: '#c92a2a' },
    'plan-not-versioned': { label: '方案未保存', color: '#8a7d6b' }
  } as const;

  const STATUS_META = {
    pass: { label: '通过', color: '#2b8a3e', icon: '✓' },
    warn: { label: '待确认', color: '#e8890c', icon: '!' },
    fail: { label: '阻断', color: '#c92a2a', icon: '×' }
  } as const;

  function fmtTime(iso: string): string {
    return iso.slice(0, 16).replace('T', ' ');
  }
</script>

<div class="modal-backdrop" on:click={() => dispatch('close')} on:keydown={() => dispatch('close')} role="presentation">
  <div class="modal preview" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true">
    <h3>导出预览 · 生成档案前确认</h3>

    <!-- 项目基本信息 -->
    <section class="block">
      <h4>项目基本信息</h4>
      <div class="meta-grid">
        <div><span>项目名称</span><b>{preview.project.name || '—'}</b></div>
        <div><span>馆藏号</span><b>{preview.project.shelf_no || '—'}</b></div>
        <div><span>年代</span><b>{preview.project.era || '—'}</b></div>
        <div><span>建档人</span><b>{preview.project.author || '—'}</b></div>
        <div><span>建档时间</span><b>{fmtTime(preview.project.created_at)}</b></div>
        <div><span>最近更新</span><b>{fmtTime(preview.project.updated_at)}</b></div>
      </div>
    </section>

    <!-- 汇总计数 -->
    <section class="block">
      <h4>内容汇总</h4>
      <div class="counts">
        <div><b>{preview.counts.folios}</b><span>扫描叶</span></div>
        <div><b>{preview.counts.damageShapes}</b><span>破损标注</span></div>
        <div><b>{preview.counts.repairShapes}</b><span>修复方案</span></div>
        <div><b>{preview.counts.steps}</b><span>工序</span></div>
        <div class:warn={preview.counts.unresolvedComments > 0}>
          <b>{preview.counts.unresolvedComments}</b><span>未解决批注</span>
        </div>
        <div><b>{preview.counts.afterImages}</b><span>修复后图</span></div>
        <div><b>{preview.counts.manualVersions}</b><span>保存版本</span></div>
      </div>
    </section>

    <!-- 前后对比图 -->
    <section class="block">
      <h4>前后对比图（{preview.counts.afterImages}/{preview.counts.folios} 叶有修复后图）</h4>
      <div class="folio-grid">
        {#each preview.folios as f}
          <div class="folio" class:missing={!f.hasAfter}>
            <div class="imgs">
              <img src={mediaUrl(projectId, folioRels[f.folio_id]?.original ?? '')} alt="修复前" loading="lazy" />
              {#if f.hasAfter && folioRels[f.folio_id]?.after}
                <img src={mediaUrl(projectId, folioRels[f.folio_id].after)} alt="修复后" loading="lazy" />
              {:else}
                <div class="no-after">缺修复后图</div>
              {/if}
            </div>
            <div class="fname" title={f.name}>{f.name}</div>
          </div>
        {/each}
      </div>
    </section>

    <!-- 风险 -->
    <section class="block">
      <h4>归档风险（{preview.risks.length}）</h4>
      {#if preview.risks.length === 0}
        <p class="ok-text">未发现归档风险，可以直接生成档案。</p>
      {:else}
        <ul class="risks">
          {#each preview.risks as r (r.code + (r.folio_id ?? ''))}
            <li>
              <span class="tag" style={`background:${RISK_META[r.code].color}`}>{RISK_META[r.code].label}</span>
              <div>
                <b>{r.title}</b>
                <p>{r.detail}</p>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- 校验清单 -->
    <section class="block">
      <h4>校验清单</h4>
      <ul class="checklist">
        {#each preview.checklist as c}
          <li class={c.status}>
            <span class="status" style={`background:${STATUS_META[c.status].color}`}>{STATUS_META[c.status].icon}</span>
            <span class="clabel">{c.label}</span>
            <span class="cdot">{c.detail}</span>
          </li>
        {/each}
      </ul>
    </section>

    <!-- 选项与确认 -->
    <section class="block options">
      <label class="check">
        <input type="checkbox" bind:checked={includeOriginal} />
        包含原图只读副本（否则仅含对照图与缩略图；checksums.txt 始终登记原图 sha256）
      </label>
      {#if preview.risks.length > 0}
        <label class="ack" class:checked={acknowledged}>
          <input type="checkbox" bind:checked={acknowledged} />
          我已知悉上述 {preview.risks.length} 项归档风险，仍要生成档案（风险内容会保留在数据中，可日后补正后重新导出）
        </label>
      {/if}
    </section>

    <div class="actions">
      <button class="btn ghost" on:click={() => dispatch('close')} disabled={exporting}>取消</button>
      <button
        class="btn primary"
        on:click={() => dispatch('confirm')}
        disabled={exporting || !preview.canExport || (preview.risks.length > 0 && !acknowledged)}
      >
        {exporting ? '正在打包…' : '确认并生成离线档案 zip'}
      </button>
    </div>
  </div>
</div>

<style>
  .modal.preview {
    width: min(860px, 94vw);
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px 24px;
  }
  h3 {
    margin: 0 0 12px;
    font-size: 16px;
  }
  h4 {
    font-size: 12px;
    letter-spacing: 1px;
    color: #6f6150;
    margin: 0 0 8px;
  }
  .block {
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid #ece2cd;
  }
  .block:last-of-type {
    border-bottom: none;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px 16px;
    font-size: 12px;
  }
  .meta-grid span {
    color: #8a7d6b;
    margin-right: 6px;
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    text-align: center;
  }
  .counts div {
    background: #f5eddc;
    border-radius: 6px;
    padding: 8px 4px;
  }
  .counts b {
    display: block;
    font-size: 17px;
  }
  .counts span {
    font-size: 11px;
    color: #8a7d6b;
  }
  .counts .warn b {
    color: #c92a2a;
  }
  .folio-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }
  .folio {
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    background: #fffdf8;
  }
  .folio.missing {
    border-color: #e8b07a;
  }
  .imgs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: #e7dcc4;
  }
  .imgs img {
    width: 100%;
    height: 74px;
    object-fit: cover;
    display: block;
    background: #f3ece0;
  }
  .no-after {
    height: 74px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f7ece0;
    color: #b25c17;
    font-size: 11px;
  }
  .fname {
    font-size: 11px;
    padding: 4px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .risks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .risks li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    background: #fbf3e8;
    border: 1px solid #f0ddc2;
    border-radius: 6px;
    padding: 8px 10px;
  }
  .risks .tag {
    flex: none;
    font-size: 11px;
    color: #fff;
    border-radius: 3px;
    padding: 2px 6px;
    margin-top: 1px;
  }
  .risks b {
    font-size: 13px;
  }
  .risks p {
    margin: 2px 0 0;
    font-size: 12px;
    color: #6f6150;
  }
  .ok-text {
    font-size: 12px;
    color: #2b8a3e;
    margin: 0;
  }
  .checklist {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .checklist li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
  }
  .status {
    flex: none;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    color: #fff;
    font-size: 11px;
    text-align: center;
    line-height: 17px;
    font-weight: 700;
  }
  .clabel {
    flex: none;
    width: 110px;
    font-weight: 500;
  }
  .cdot {
    color: #6f6150;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .check,
  .ack {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 12px;
  }
  .ack {
    background: #fbf0e2;
    border: 1px solid #ecd7b8;
    border-radius: 6px;
    padding: 8px 10px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 6px;
  }
  .btn.primary {
    background: var(--accent);
    color: #f8f0e1;
    border-color: var(--accent);
  }
  .btn.primary:disabled {
    opacity: 0.5;
  }
</style>
