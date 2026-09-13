<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { api, mediaUrl } from '../lib/api';
  import { AnnotationEditor, type Tool } from '../lib/editor';
  import { DAMAGE_KINDS, DAMAGE_META, LAYER_KIND_META } from '@shared/constants';
  import type { DamageKind, Layer, Shape } from '@shared/types';
  import {
    activeLayerId,
    busy,
    comments,
    currentFolioId,
    currentProjectId,
    folios,
    layers,
    selectedShapeId,
    shapes
  } from '../lib/stores';
  import { guard, toast } from '../lib/toast';
  import VersionsPanel from '../components/VersionsPanel.svelte';

  let containerEl: HTMLDivElement;
  let editor: AnnotationEditor | null = null;
  let tool: Tool = 'select';
  let damage: DamageKind = 'wormhole';
  let showVersions = false;
  let newLayerName = '';

  let pid = '';
  currentProjectId.subscribe((v) => (pid = v));
  let fid: string | null = null;
  currentFolioId.subscribe((v) => (fid = v));

  $: folio = $folios.find((f) => f.id === fid) ?? $folios[0] ?? null;
  $: activeLayer = $layers.find((l) => l.id === $activeLayerId) ?? null;
  $: selected = $shapes.find((s) => s.id === $selectedShapeId) ?? null;

  async function switchFolio(id: string) {
    currentFolioId.set(id);
  }

  onMount(async () => {
    await mountEditor();
  });

  let mountedFolio: string | null = null;
  $: if (folio && fid && fid !== mountedFolio) {
    mountedFolio = fid;
    void remount(fid);
  }
  $: if (editor) editor.setLayers($layers);
  $: if (editor) editor.setActiveLayer($activeLayerId);
  $: if (editor) editor.syncShapes($shapes);

  async function mountEditor() {
    if (editor || !folio) return;
    editor = new AnnotationEditor(containerEl, folio, {
      onCreateShape: async (input) => {
        const s = await api.shapes.create(folio!.id, input);
        shapes.update((list) => [...list, s]);
        selectedShapeId.set(s.id);
        return s;
      },
      onUpdateShape: async (shape, geometry) => {
        const s = await api.shapes.update(shape.id, { geometry });
        shapes.update((list) => list.map((x) => (x.id === s.id ? s : x)));
      },
      onSelect: (s) => selectedShapeId.set(s?.id ?? null)
    });
    const url = mediaUrl(pid, folio.original_rel);
    await editor.loadImage(url);
  }

  async function remount(id: string) {
    editor?.destroy();
    editor = null;
    const f = $folios.find((x) => x.id === id);
    if (!f) return;
    editor = new AnnotationEditor(containerEl, f, {
      onCreateShape: async (input) => {
        const s = await api.shapes.create(id, input);
        shapes.update((list) => [...list, s]);
        selectedShapeId.set(s.id);
        return s;
      },
      onUpdateShape: async (shape, geometry) => {
        const s = await api.shapes.update(shape.id, { geometry });
        shapes.update((list) => list.map((x) => (x.id === s.id ? s : x)));
      },
      onSelect: (s) => selectedShapeId.set(s?.id ?? null)
    });
    await editor.loadImage(mediaUrl(pid, f.original_rel));
    editor.setLayers($layers);
    editor.syncShapes($shapes);
  }

  function setTool(t: Tool) {
    tool = t;
    editor?.setTool(t);
  }
  function setDamage(d: DamageKind) {
    damage = d;
    editor?.setDamage(d);
  }

  async function toggleLayer(l: Layer, patch: Partial<Layer>) {
    const next = await guard(api.layers.update(l.id, patch), '更新图层失败');
    if (next) layers.update((ls) => ls.map((x) => (x.id === l.id ? next : x)));
  }
  async function addLayer() {
    if (!fid || !newLayerName.trim()) return;
    const kind: Layer['kind'] = 'damage';
    const l = await guard(api.layers.create(fid, { name: newLayerName.trim(), kind, color: DAMAGE_META[damage].color }), '新建图层失败');
    if (l) {
      layers.update((ls) => [...ls, l]);
      activeLayerId.set(l.id);
      newLayerName = '';
    }
  }
  async function removeLayer(l: Layer) {
    if (!confirm(`删除图层「${l.name}」？该层标注将一并删除。`)) return;
    await guard(api.layers.remove(l.id), '删除图层失败');
    layers.update((ls) => ls.filter((x) => x.id !== l.id));
    shapes.update((ss) => ss.filter((s) => s.layer_id !== l.id));
  }

  async function saveShapePatch(patch: Partial<Shape>) {
    if (!selected) return;
    const s = await guard(api.shapes.update(selected.id, patch), '保存标注失败');
    if (s) shapes.update((ls) => ls.map((x) => (x.id === s.id ? s : x)));
  }
  async function deleteShape() {
    if (!selected || !editor) return;
    await guard(api.shapes.remove(selected.id), '删除标注失败');
    shapes.update((ls) => ls.filter((x) => x.id !== selected.id));
    editor.deleteSelected();
  }

  async function pickAverage() {
    if (!folio) return;
    busy.set(true);
    const r = await guard(api.folios.averageColor(folio.id, selected ? selected.geometry : null), '取色失败');
    busy.set(false);
    if (r) toast(`平均色 ${r.hex}（可在样本页据此建立纸张样本）`);
  }

  async function setAfterImage() {
    const files = await api.dialog.pickImages();
    if (!files.length || !folio) return;
    busy.set(true);
    const f = await guard(api.folios.setAfterImage(folio.id, files[0].path), '导入修复后图像失败');
    busy.set(false);
    if (f) {
      folios.update((fs) => fs.map((x) => (x.id === f.id ? f : x)));
      toast('已设置修复后对照图（原图保持不变）');
    }
  }

  $: damageStats = $shapes.reduce(
    (acc, s) => {
      acc[s.damage] = (acc[s.damage] ?? 0) + s.area_px;
      return acc;
    },
    {} as Record<string, number>
  );

  $: damageEntries = Object.entries(damageStats).filter(([k]) => k in DAMAGE_META) as [DamageKind, number][];

  function damageFromSelect(el: EventTarget | null): DamageKind {
    return (el as HTMLSelectElement).value as DamageKind;
  }

  function fmtArea(px: number): string {
    if (!folio) return '0';
    const ratio = px / (folio.width * folio.height);
    return `${(ratio * 100).toFixed(2)}% 叶面`;
  }

  onDestroy(() => editor?.destroy());
</script>

<div class="annotate">
  <div class="folio-strip">
    {#each $folios as f}
      <button class="folio-thumb" class:active={f.id === folio?.id} on:click={() => switchFolio(f.id)}>
        <img src={mediaUrl(pid, f.thumb_rel)} alt={f.name} />
        <span>{f.name}</span>
      </button>
    {/each}
  </div>

  <div class="workspace">
    <div class="left-panel">
      <div class="tool-group card">
        <h3>工具</h3>
        <div class="tools">
          <button class:on={tool === 'select'} on:click={() => setTool('select')}>选择/拖动</button>
          <button class:on={tool === 'rect'} on:click={() => setTool('rect')}>矩形</button>
          <button class:on={tool === 'ellipse'} on:click={() => setTool('ellipse')}>椭圆</button>
          <button class:on={tool === 'polygon'} on:click={() => setTool('polygon')}>套索多边形</button>
        </div>
        <h3>破损类型</h3>
        <div class="damages">
          {#each DAMAGE_KINDS as d}
            <button class:on={damage === d} style={`--c:${DAMAGE_META[d].color}`} on:click={() => setDamage(d)}>
              <i style={`background:${DAMAGE_META[d].color}`}></i>{DAMAGE_META[d].label}
            </button>
          {/each}
        </div>
        <div class="zoom">
          <button class="btn tiny ghost" on:click={() => editor?.zoomOut()}>－</button>
          <button class="btn tiny ghost" on:click={() => editor?.actualSize()}>1:1</button>
          <button class="btn tiny ghost" on:click={() => editor?.zoomIn()}>＋</button>
          <button class="btn tiny ghost" on:click={() => editor?.fit()}>适合</button>
        </div>
      </div>
    </div>

    <div class="canvas-wrap" bind:this={containerEl}>
      {#if !folio}<div class="empty">当前项目还没有扫描叶，点顶部“导入扫描”。</div>{/if}
    </div>

    <div class="right-panel">
      <div class="card layers-card">
          <h3>图层</h3>
          <ul class="layer-list">
            {#each [...$layers].sort((a, b) => a.order_index - b.order_index) as l}
              <li class:active={$activeLayerId === l.id} on:click={() => activeLayerId.set(l.id)}>
                <input type="checkbox" checked={l.visible} on:change={(e) => toggleLayer(l, { visible: e.currentTarget.checked })} on:click|stopPropagation />
                <span class="dot" style={`background:${l.color}`}></span>
                <span class="lname">{l.name}</span>
                <span class="lk">{LAYER_KIND_META[l.kind].label}</span>
                <button class="x" title="删除" on:click|stopPropagation={() => removeLayer(l)}>×</button>
              </li>
            {/each}
          </ul>
          <div class="add-layer">
            <input placeholder="新图层名" bind:value={newLayerName} />
            <button class="btn tiny" on:click={addLayer}>＋ 图层</button>
          </div>
        </div>

        {#if selected}
          <div class="card prop-card">
            <h3>标注属性</h3>
            <div class="field">
              <label>名称</label>
              <input value={selected.label} on:change={(e) => saveShapePatch({ label: e.currentTarget.value })} />
            </div>
            <div class="field">
              <label>破损类型</label>
              <select value={selected.damage} on:change={(e) => saveShapePatch({ damage: damageFromSelect(e.currentTarget) })}>
                {#each DAMAGE_KINDS as d}
                  <option value={d}>{DAMAGE_META[d].label}</option>
                {/each}
              </select>
            </div>
            <div class="field">
              <label>范围（像素估算）</label>
              <div>{Math.round(selected.area_px).toLocaleString()} px² ≈ {fmtArea(selected.area_px)}</div>
            </div>
            <div class="field">
              <label>备注</label>
              <textarea value={selected.note} on:change={(e) => saveShapePatch({ note: e.currentTarget.value })}></textarea>
            </div>
            <button class="btn tiny ghost" on:click={pickAverage}>从图上取平均色</button>
            <button class="btn tiny" style="margin-left:6px;background:#8c2f24" on:click={deleteShape}>删除标注</button>
          </div>
        {/if}

        <div class="card stats-card">
          <h3>破损统计</h3>
          <ul>
            {#each damageEntries as [k, v]}
              <li><i style={`background:${DAMAGE_META[k]?.color}`}></i>{DAMAGE_META[k]?.label ?? k}<b>{fmtArea(v)}</b></li>
            {/each}
            {#if Object.keys(damageStats).length === 0}
              <li class="muted">尚无标注</li>
            {/if}
          </ul>
        </div>

        <div class="card version-card">
          <h3>方案版本</h3>
          <button class="btn tiny" on:click={() => (showVersions = true)}>版本历史 / 回退</button>
          <button class="btn tiny secondary" on:click={setAfterImage}>设置修复后图</button>
        </div>
    </div>
  </div>
</div>

{#if showVersions && folio}
  <VersionsPanel folioId={folio.id} on:close={() => (showVersions = false)} />
{/if}

<style>
  .annotate {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .folio-strip {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    background: #efe7d6;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
  }
  .folio-thumb {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 3px;
    min-width: 72px;
    cursor: pointer;
  }
  .folio-thumb.active {
    border-color: var(--accent);
    background: #e7dcc2;
  }
  .folio-thumb img {
    width: 56px;
    height: 76px;
    object-fit: cover;
    border-radius: 2px;
  }
  .folio-thumb span {
    font-size: 10px;
    color: #7a6c52;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workspace {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 168px minmax(0, 1fr) 256px;
    grid-template-rows: minmax(0, 1fr);
  }
  .canvas-wrap {
    min-width: 0;
    min-height: 0;
  }
  .left-panel,
  .right-panel {
    padding: 10px;
    overflow-y: auto;
    background: #f2ebdc;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .left-panel h3,
  .right-panel h3 {
    font-size: 12px;
    color: #6f6150;
    letter-spacing: 2px;
    margin: 0 0 6px;
  }
  .tools,
  .damages {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
  }
  .tools button,
  .damages button {
    text-align: left;
    padding: 6px 8px;
    border: 1px solid var(--line);
    background: #fffdf8;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .tools button.on,
  .damages button.on {
    border-color: var(--c, var(--accent));
    box-shadow: inset 0 0 0 1px var(--c, var(--accent));
  }
  .damages i {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 5px;
  }
  .zoom {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .canvas-wrap {
    position: relative;
    overflow: hidden;
    flex: 1;
    min-height: 0;
    background: #d9cfb6;
    background-image: radial-gradient(#cdbf9f 1px, transparent 1px);
    background-size: 14px 14px;
  }
  .layer-list li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 4px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .layer-list li.active {
    background: #efe4cc;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .lname {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lk {
    font-size: 10px;
    color: #9b8c75;
  }
  .x {
    border: none;
    background: none;
    color: #b0a089;
    cursor: pointer;
  }
  .add-layer {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .add-layer input {
    width: 130px;
  }
  .stats-card ul li {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    padding: 4px 0;
  }
  .stats-card i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .stats-card b {
    margin-left: auto;
    font-weight: 500;
    color: #6f6150;
  }
  .version-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
