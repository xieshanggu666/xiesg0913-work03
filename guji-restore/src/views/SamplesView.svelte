<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { api } from '../lib/api';
  import { samples } from '../lib/stores';
  import { guard, toast } from '../lib/toast';
  import { applyLibraryQuery, type LibrarySortKey } from '@shared/list-query';
  import type { SampleKind } from '@shared/types';

  const dispatch = createEventDispatcher<{ recommend: string }>();
  type SortKey = LibrarySortKey;
  let kind: SampleKind = 'paper';
  let query = '';
  let sortKey: SortKey = 'updated';
  let sortAsc = false;
  let editing: any = null;

  function openNew(k: SampleKind) {
    kind = k;
    editing = blank();
  }
  function blank() {
    return { name: '', source: '', color_hex: '#e6d8b0', fiber: '', grain: '', thickness_mm: '', absorbency: '中', note: '' };
  }
  function edit(s: any) {
    kind = s.kind;
    editing = { ...s, thickness_mm: s.thickness_mm ?? '' };
  }

  async function save() {
    if (!editing.name.trim()) return toast('请填写样本名称', 'error');
    const payload = {
      project_id: null,
      kind,
      name: editing.name.trim(),
      source: editing.source,
      color_hex: editing.color_hex,
      lab: null,
      fiber: editing.fiber,
      grain: editing.grain,
      thickness_mm: editing.thickness_mm === '' ? null : Number(editing.thickness_mm),
      absorbency: editing.absorbency,
      image_rel: null,
      note: editing.note
    };
    const r = editing.id
      ? await guard(api.samples.update(editing.id, payload), '保存失败')
      : await guard(api.samples.create(payload), '新建样本失败');
    if (r) {
      editing = null;
      samples.set(await api.samples.list());
      toast('样本已保存（Lab 自动由 hex 计算）');
    }
  }
  async function remove(id: string) {
    if (!confirm('删除该样本？')) return;
    await guard(api.samples.remove(id), '删除失败');
    samples.set(await api.samples.list());
  }

  // 搜索（名称 / 来源 / 纤维 / 备注）与分类筛选同时生效，再按选择排序
  $: kindTotal = $samples.filter((s) => s.kind === kind).length;
  $: visible = applyLibraryQuery(
    $samples.filter((s) => s.kind === kind),
    query,
    [(s) => s.name, (s) => s.source, (s) => s.fiber, (s) => s.note],
    { key: sortKey, asc: sortAsc }
  );
</script>

<div class="view-head">
  <h2>纸张与墨色样本库</h2>
  <div class="spacer"></div>
  <button class="btn secondary" on:click={() => openNew('paper')}>＋ 纸张样本</button>
  <button class="btn secondary" on:click={() => openNew('ink')}>＋ 墨色样本</button>
</div>

<div class="toolbar">
  <div class="filters">
    <button class="btn tiny ghost" class:on={kind === 'paper'} on:click={() => (kind = 'paper')}>纸张</button>
    <button class="btn tiny ghost" class:on={kind === 'ink'} on:click={() => (kind = 'ink')}>墨色</button>
  </div>
  <div class="search-box">
    <input type="search" bind:value={query} placeholder="搜索名称、来源、纤维、备注…" aria-label="搜索样本" />
    {#if query}
      <button class="clear" on:click={() => (query = '')} aria-label="清空搜索" title="清空搜索">×</button>
    {/if}
  </div>
  <label class="sort">
    排序
    <select bind:value={sortKey} aria-label="排序字段">
      <option value="updated">按更新时间</option>
      <option value="name">按名称</option>
    </select>
    <button class="btn tiny ghost" on:click={() => (sortAsc = !sortAsc)} title="切换升序/降序">
      {sortAsc ? '升序 ↑' : '降序 ↓'}
    </button>
  </label>
  <span class="count">
    {#if query.trim()}匹配 {visible.length} / {kindTotal}{:else}共 {kindTotal}{/if} 条
  </span>
</div>

{#if visible.length === 0}
  <div class="empty">
    {#if query.trim()}
      没有找到与「{query.trim()}」匹配的{kind === 'paper' ? '纸张' : '墨色'}样本，
      可尝试更换关键词，或
      <button class="link" on:click={() => (query = '')}>清空搜索</button>。
    {:else}
      暂无{kind === 'paper' ? '纸张' : '墨色'}样本，点击右上角「＋ {kind === 'paper' ? '纸张' : '墨色'}样本」录入第一条。
    {/if}
  </div>
{/if}

<ul class="grid">
  {#each visible as s (s.id)}
    <li class="card sample">
      <div class="swatch" style={`background:${s.color_hex}`}></div>
      <h3>{s.name}</h3>
      <div class="muted">{s.kind === 'paper' ? '纸张' : '墨色'}{s.lab ? ` · Lab(${s.lab.L.toFixed(0)},${s.lab.a.toFixed(0)},${s.lab.b.toFixed(0)})` : ''}</div>
      {#if s.kind === 'paper'}
        <p>{s.fiber || '未记录纤维'}</p>
        <p class="muted">帘纹：{s.grain || '—'}　厚：{s.thickness_mm ?? '—'} mm　吸水：{s.absorbency || '—'}</p>
      {:else}
        <p class="muted">{s.note || '墨色样本'}</p>
      {/if}
      <p class="muted">{s.source}</p>
      <div class="row">
        {#if s.kind === 'paper'}
          <button class="btn tiny" on:click={() => dispatch('recommend', s.id)}>推荐材料</button>
        {/if}
        <button class="btn tiny ghost" on:click={() => edit(s)}>编辑</button>
        <button class="btn tiny ghost" on:click={() => remove(s.id)}>删除</button>
      </div>
    </li>
  {/each}
</ul>

{#if editing}
  <div class="modal-backdrop" on:click={() => (editing = null)}>
    <div class="modal" on:click|stopPropagation>
      <h3>{editing.id ? '编辑' : '新建'}{kind === 'paper' ? '纸张' : '墨色'}样本</h3>
      <div class="field">
        <label>名称 *</label>
        <input bind:value={editing.name} placeholder={kind === 'paper' ? '如：叶心原纸（竹浆皮纸）' : '如：松烟墨'} />
      </div>
      <div class="field">
        <label>取样部位 / 来源</label>
        <input bind:value={editing.source} />
      </div>
      <div class="field color-row">
        <label>颜色</label>
        <input type="color" bind:value={editing.color_hex} />
        <input bind:value={editing.color_hex} />
        <span class="muted">可在标注页用“从图上取平均色”初判，再用测色仪校正</span>
      </div>
      {#if kind === 'paper'}
        <div class="field"><label>纤维成分</label><input bind:value={editing.fiber} placeholder="如：竹浆约 70% / 皮料 30%" /></div>
        <div class="two">
          <div class="field"><label>帘纹 / 丝缕</label><input bind:value={editing.grain} placeholder="竖帘纹" /></div>
          <div class="field"><label>厚度 mm</label><input type="number" step="0.01" bind:value={editing.thickness_mm} /></div>
        </div>
        <div class="field">
          <label>吸水性</label>
          <select bind:value={editing.absorbency}>
            <option>低</option><option>中</option><option>高</option>
          </select>
        </div>
      {/if}
      <div class="field"><label>备注</label><textarea bind:value={editing.note}></textarea></div>
      <div class="actions">
        <button class="btn ghost" on:click={() => (editing = null)}>取消</button>
        <button class="btn" on:click={save}>保存</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .view-head {
    display: flex;
    align-items: center;
    padding: 16px 22px 0;
  }
  h2 {
    font-size: 17px;
  }
  .spacer {
    flex: 1;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 22px 0;
  }
  .filters {
    display: flex;
    gap: 6px;
  }
  .search-box {
    position: relative;
    flex: 1 1 200px;
    min-width: 180px;
    max-width: 360px;
  }
  .search-box input {
    width: 100%;
    padding: 5px 26px 5px 10px;
    font-size: 13px;
  }
  .clear {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: transparent;
    color: #8a7d6b;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 4px;
  }
  .clear:hover {
    color: #4a3f30;
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #6f6150;
    white-space: nowrap;
  }
  .sort select {
    padding: 4px 6px;
    font-size: 12px;
  }
  .count {
    font-size: 12px;
    color: #8a7d6b;
  }
  .empty {
    margin: 18px 22px 0;
    background: #f5eddc;
    border: 1px dashed var(--line);
    border-radius: 8px;
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    cursor: pointer;
    font-size: inherit;
    padding: 0;
    text-decoration: underline;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
    padding: 14px 22px;
  }
  .sample {
    padding: 14px;
    list-style: none;
  }
  .sample h3 {
    font-size: 14px;
    margin: 8px 0 2px;
  }
  .sample p {
    margin: 4px 0;
    font-size: 12px;
  }
  .swatch {
    height: 56px;
    border-radius: 4px;
    border: 1px solid var(--line);
  }
  .row {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .color-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .color-row input[type='color'] {
    width: 40px;
    height: 32px;
    padding: 0;
  }
</style>
