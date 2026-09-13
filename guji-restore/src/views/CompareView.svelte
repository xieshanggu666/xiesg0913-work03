<script lang="ts">
  import { api, mediaUrl } from '../lib/api';
  import { currentFolioId, currentProjectId, folios } from '../lib/stores';
  import { guard, toast } from '../lib/toast';
  import {
    fitScale,
    fitView,
    imageTransform,
    panBy,
    shouldZoomOnWheel,
    zoomAt,
    type ViewState
  } from '../lib/panzoom';

  let pid = '';
  currentProjectId.subscribe((v) => (pid = v));
  let fid: string | null = null;
  currentFolioId.subscribe((v) => (fid = v));

  $: withAfter = $folios.filter((f) => f.after_rel);
  $: folio =
    withAfter.find((f) => f.id === fid) ??
    withAfter[0] ??
    $folios.find((f) => f.id === fid) ??
    null;

  let slider = 50;
  let mode: 'side' | 'slide' = 'side';

  // ---- 同步缩放 / 平移 ----
  // 前后两图共享同一份视图状态（zoom 为相对适配的倍数，cx/cy 为视图中心的归一化内容坐标），
  // 因此天然同步；切换并排/滑动模式时状态保留，观察位置不变。
  let view: ViewState = fitView();
  let paneW = 0;
  let paneH = 0;
  let beforeNat = { w: 0, h: 0 };
  let afterNat = { w: 0, h: 0 };
  let dragging = false;

  // 切换叶次：恢复适配视图，旧图尺寸作废等待重新加载
  let mountedFolio: string | null = null;
  $: if (folio && folio.id !== mountedFolio) {
    mountedFolio = folio.id;
    view = fitView();
    beforeNat = { w: 0, h: 0 };
    afterNat = { w: 0, h: 0 };
  }

  $: canView = !!(folio && folio.after_rel);
  $: paneSize = { w: paneW, h: paneH };
  $: fitBefore = fitScale(beforeNat, paneSize);
  $: fitAfter = fitScale(afterNat, paneSize);
  $: tBefore = imageTransform(view, fitBefore, beforeNat, paneSize);
  $: tAfter = imageTransform(view, fitAfter, afterNat, paneSize);
  $: zoomPct = Math.round(view.zoom * 100);

  function toCss(t: { tx: number; ty: number; scale: number }): string {
    return `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`;
  }

  function onImgLoad(which: 'before' | 'after', e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    const nat = { w: img.naturalWidth, h: img.naturalHeight };
    if (which === 'before') beforeNat = nat;
    else afterNat = nat;
  }

  function onWheel(e: WheelEvent, which: 'before' | 'after') {
    if (!canView) return;
    // 触控板横向滚动（deltaX 为主或无纵向分量）不缩放、不拦截，保留默认行为
    if (!shouldZoomOnWheel(e)) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const anchor = { x: e.clientX - r.left, y: e.clientY - r.top };
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    view = zoomAt(view, factor, anchor, paneSize, which === 'before' ? beforeNat : afterNat, which === 'before' ? fitBefore : fitAfter);
  }

  let drag: { x: number; y: number; which: 'before' | 'after' } | null = null;
  function onPointerDown(e: PointerEvent, which: 'before' | 'after') {
    if (e.button !== 0 || !canView) return;
    drag = { x: e.clientX, y: e.clientY, which };
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    view = panBy(view, dx, dy, drag.which === 'before' ? beforeNat : afterNat, drag.which === 'before' ? fitBefore : fitAfter);
  }
  function onPointerUp() {
    drag = null;
    dragging = false;
  }

  function zoomStep(factor: number) {
    // 按钮缩放以视图中心为锚（以前图为基准，后图经共享状态同步）
    view = zoomAt(view, factor, { x: paneW / 2, y: paneH / 2 }, paneSize, beforeNat, fitBefore);
  }
  function resetView() {
    view = fitView();
  }

  async function setAfter() {
    const files = await api.dialog.pickImages();
    if (!files.length || !folio) return;
    const r = await guard(api.folios.setAfterImage(folio.id, files[0].path), '导入失败');
    if (r) {
      folios.update((fs) => fs.map((f) => (f.id === r.id ? r : f)));
      toast('已设置修复后图像，原图未被改动');
    }
  }
</script>

<div class="view-head">
  <h2>修复前后对比</h2>
  <select class="folio-select" value={folio?.id ?? ''} on:change={(e) => currentFolioId.set(e.currentTarget.value)}>
    {#each $folios.filter((f) => f.after_rel) as f}
      <option value={f.id}>{f.name}</option>
    {/each}
  </select>
  <div class="spacer"></div>
  <div class="seg">
    <button class="btn tiny ghost" class:on={mode === 'side'} on:click={() => (mode = 'side')}>并排</button>
    <button class="btn tiny ghost" class:on={mode === 'slide'} on:click={() => (mode = 'slide')}>滑动叠加</button>
  </div>
  <div class="zoombar" title="滚轮缩放，拖动平移">
    <button class="btn tiny ghost" aria-label="缩小" on:click={() => zoomStep(1 / 1.25)} disabled={!canView}>－</button>
    <span class="pct">{zoomPct}%</span>
    <button class="btn tiny ghost" aria-label="放大" on:click={() => zoomStep(1.25)} disabled={!canView}>＋</button>
    <button class="btn tiny ghost" on:click={resetView} disabled={!canView}>复位</button>
  </div>
  <button class="btn secondary" on:click={setAfter}>设置修复后图</button>
</div>

{#if !folio}
  <div class="empty">
    还没有任何叶次上传修复后图像。<br />在标注页为对应叶点“设置修复后图”，或在此页右上角上传。
  </div>
{:else if !folio.after_rel}
  <div class="empty">「{folio.name}」尚无修复后图像。</div>
{:else}
  <div class="stage {mode === 'side' ? 'side' : 'slide'}">
    <div
      class="pane before"
      class:dragging
      bind:clientWidth={paneW}
      bind:clientHeight={paneH}
      on:wheel={(e) => onWheel(e, 'before')}
      on:pointerdown={(e) => onPointerDown(e, 'before')}
      on:pointermove={onPointerMove}
      on:pointerup={onPointerUp}
      on:pointercancel={onPointerUp}
    >
      <div class="imgbox" style="width:{beforeNat.w}px;height:{beforeNat.h}px;transform:{toCss(tBefore)}">
        <img src={mediaUrl(pid, folio.original_rel)} alt="修复前" draggable="false" on:load={(e) => onImgLoad('before', e)} />
      </div>
      <span class="badge">修复前 · 只读原图（sha256 已存档）</span>
    </div>
    <div
      class="pane after"
      class:dragging
      style={mode === 'slide' ? `clip-path: inset(0 0 0 ${slider}%)` : ''}
      on:wheel={(e) => onWheel(e, 'after')}
      on:pointerdown={(e) => onPointerDown(e, 'after')}
      on:pointermove={onPointerMove}
      on:pointerup={onPointerUp}
      on:pointercancel={onPointerUp}
    >
      <div class="imgbox" style="width:{afterNat.w}px;height:{afterNat.h}px;transform:{toCss(tAfter)}">
        <img src={mediaUrl(pid, folio.after_rel)} alt="修复后" draggable="false" on:load={(e) => onImgLoad('after', e)} />
      </div>
      <span class="badge ok">修复后</span>
    </div>
    {#if mode === 'slide'}
      <div class="divider" style={`left:${slider}%`}></div>
      <input class="slider" type="range" min="0" max="100" bind:value={slider} />
    {/if}
  </div>
{/if}

<style>
  .view-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 22px 0;
  }
  h2 {
    font-size: 17px;
  }
  .spacer {
    flex: 1;
  }
  .folio-select {
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 6px 8px;
    background: #fffdf8;
  }
  .seg {
    display: flex;
  }
  .seg button.on {
    background: #e4d4b4;
  }
  .zoombar {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .zoombar .pct {
    min-width: 46px;
    text-align: center;
    font-size: 12px;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  .stage {
    position: relative;
    margin: 14px 22px 22px;
    flex: 1;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #efe7d3;
    overflow: hidden;
  }
  .stage.side {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
  }
  .stage.slide .pane {
    position: absolute;
    inset: 0;
  }
  .pane {
    position: relative;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
    cursor: grab;
    touch-action: none;
  }
  .pane.dragging {
    cursor: grabbing;
  }
  .imgbox {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    will-change: transform;
  }
  .imgbox img {
    width: 100%;
    height: 100%;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
  }
  .badge {
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(43, 42, 39, 0.82);
    color: #f3ead9;
    font-size: 11px;
    padding: 3px 9px;
    border-radius: 99px;
    pointer-events: none;
  }
  .badge.ok {
    background: rgba(43, 138, 62, 0.88);
  }
  .slider {
    position: absolute;
    left: 12%;
    right: 12%;
    bottom: 18px;
  }
  .divider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
    pointer-events: none;
  }
</style>
