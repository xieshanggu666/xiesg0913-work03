<script lang="ts">
  import { api } from '../lib/api';
  import { materials, recommendSampleId, samples } from '../lib/stores';
  import { guard, toast } from '../lib/toast';
  import { MATERIAL_CATEGORIES, MATERIAL_CATEGORY_META } from '@shared/constants';
  import { applyLibraryQuery, type LibrarySortKey } from '@shared/list-query';
  import type { MaterialCategory, Recommendation } from '@shared/types';

  type SortKey = LibrarySortKey;
  let editing: any = null;
  let category: MaterialCategory | '' = '';
  let query = '';
  let sortKey: SortKey = 'updated';
  let sortAsc = false;
  let recs: Recommendation[] | null = null;
  let recLoading = false;

  function blank() {
    return {
      name: '',
      category: 'xuan',
      color_hex: '#efe6cf',
      fiber: '',
      thickness_mm: '',
      weight_gsm: '',
      weave: '',
      ph: '',
      supplier: '',
      note: ''
    };
  }

  async function save() {
    if (!editing.name.trim()) return toast('请填写材料名称', 'error');
    const payload = {
      name: editing.name.trim(),
      category: editing.category,
      color_hex: editing.color_hex,
      lab: null,
      fiber: editing.fiber,
      thickness_mm: editing.thickness_mm === '' ? null : Number(editing.thickness_mm),
      weight_gsm: editing.weight_gsm === '' ? null : Number(editing.weight_gsm),
      weave: editing.weave,
      ph: editing.ph === '' ? null : Number(editing.ph),
      supplier: editing.supplier,
      note: editing.note
    };
    const r = editing.id
      ? await guard(api.materials.update(editing.id, payload), '保存失败')
      : await guard(api.materials.create(payload), '新建材料失败');
    if (r) {
      editing = null;
      materials.set(await api.materials.list());
      toast('材料已保存（Lab 自动由 hex 计算）');
    }
  }
  async function remove(id: string) {
    if (!confirm('删除该材料？已被工序引用时仅不影响历史记录文本。')) return;
    await guard(api.materials.remove(id), '删除失败');
    materials.set(await api.materials.list());
  }

  async function runRecommend(sampleId: string) {
    recLoading = true;
    recs = null;
    const r = await guard(api.materials.recommend(sampleId, { categoryFilter: ['xuan', 'mian', 'pi', 'jian', 'juan', 'bu'] }), '推荐失败');
    recLoading = false;
    if (r) {
      recs = r;
      recommendSampleId.set(sampleId);
    }
  }

  // 搜索（名称 / 纤维 / 纹理 / 供应来源 / 备注）与分类筛选同时生效，再按选择排序
  $: categoryTotal = category ? $materials.filter((m) => m.category === category).length : $materials.length;
  $: visible = applyLibraryQuery(
    category ? $materials.filter((m) => m.category === category) : $materials,
    query,
    [(m) => m.name, (m) => m.fiber, (m) => m.weave, (m) => m.supplier, (m) => m.note],
    { key: sortKey, asc: sortAsc }
  );

  let lastRecId: string | null = null;
  recommendSampleId.subscribe((id) => {
    if (id && id !== lastRecId) {
      lastRecId = id;
      void runRecommend(id);
    }
  });
</script>

<div class="view-head">
  <h2>修补材料库与推荐</h2>
  <div class="spacer"></div>
  <button class="btn secondary" on:click={() => (editing = blank())}>＋ 新材料</button>
</div>

{#if $recommendSampleId}
  {@const sample = $samples.find((s) => s.id === $recommendSampleId)}
  <div class="rec-bar card">
    <div>
      正在为样本 <b>{sample?.name}</b> 推荐补纸（ΔE2000 + 厚度/纤维/pH 加权）。
      选择仅作辅助，最终由修复师按「可逆性、最小干预」原则判断。
    </div>
    <button class="btn tiny ghost" on:click={() => recommendSampleId.set(null)}>关闭推荐</button>
  </div>
{/if}

<div class="toolbar">
  <div class="filters">
    <button class="btn tiny ghost" class:on={category === ''} on:click={() => (category = '')}>全部</button>
    {#each MATERIAL_CATEGORIES as c}
      <button class="btn tiny ghost" class:on={category === c} on:click={() => (category = c)}>
        {MATERIAL_CATEGORY_META[c]}
      </button>
    {/each}
  </div>
  <div class="search-box">
    <input type="search" bind:value={query} placeholder="搜索名称、纤维、纹理、供应来源、备注…" aria-label="搜索材料" />
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
    {#if query.trim()}匹配 {visible.length} / {categoryTotal}{:else}共 {categoryTotal}{/if} 条
  </span>
</div>

{#if visible.length === 0}
  <div class="empty">
    {#if query.trim()}
      没有找到与「{query.trim()}」匹配的{category ? MATERIAL_CATEGORY_META[category] : ''}材料，
      可尝试更换关键词，或
      <button class="link" on:click={() => (query = '')}>清空搜索</button>。
    {:else}
      暂无{category ? MATERIAL_CATEGORY_META[category] : ''}材料，点击右上角「＋ 新材料」录入第一条。
    {/if}
  </div>
{/if}

<div class="rec-layout">
  <ul class="grid">
    {#each visible as m (m.id)}
      <li class="card material">
        <div class="top">
          <div class="swatch" style={`background:${m.color_hex}`}></div>
          <div>
            <h3>{m.name}</h3>
            <div class="muted">{MATERIAL_CATEGORY_META[m.category]}　{m.weight_gsm ? m.weight_gsm + 'gsm' : ''}</div>
          </div>
        </div>
        <p>{m.fiber}</p>
        <p class="muted">{m.weave}{m.ph != null ? `　pH ${m.ph}` : ''}</p>
        <div class="row">
          <button class="btn tiny ghost" on:click={() => (editing = { ...m, thickness_mm: m.thickness_mm ?? '', weight_gsm: m.weight_gsm ?? '', ph: m.ph ?? '' })}>编辑</button>
          <button class="btn tiny ghost" on:click={() => remove(m.id)}>删除</button>
        </div>
      </li>
    {/each}
  </ul>

  {#if $recommendSampleId}
    <aside class="rec-panel card">
      <h3>推荐排序</h3>
      {#if recLoading}<p class="muted">计算中…</p>{/if}
      {#if recs}
        {#if recs.length === 0}
          <p class="muted">缺少可比较样本或材料数据。</p>
        {/if}
        {#each recs as r}
          <div class="rec" class:top={r.score >= 80}>
            <div class="rec-head">
              <b>{r.material.name}</b>
              <span class="score">{r.score.toFixed(0)}</span>
            </div>
            <div class="meter"><i style={`width:${r.score}%`}></i></div>
            <ul>
              {#each r.reasons.slice(0, 4) as reason}
                <li>{reason}</li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}
    </aside>
  {/if}
</div>

{#if editing}
  <div class="modal-backdrop" on:click={() => (editing = null)}>
    <div class="modal" on:click|stopPropagation>
      <h3>{editing.id ? '编辑材料' : '新材料'}</h3>
      <div class="field"><label>名称 *</label><input bind:value={editing.name} /></div>
      <div class="two">
        <div class="field">
          <label>类别</label>
          <select bind:value={editing.category}>
            {#each MATERIAL_CATEGORIES as c}
              <option value={c}>{MATERIAL_CATEGORY_META[c]}</option>
            {/each}
          </select>
        </div>
        <div class="field color-row">
          <label>颜色</label>
          <input type="color" bind:value={editing.color_hex} />
          <input bind:value={editing.color_hex} />
        </div>
      </div>
      <div class="field"><label>纤维成分</label><input bind:value={editing.fiber} placeholder="青檀皮 80% / 沙田稻草 20%" /></div>
      <div class="two">
        <div class="field"><label>厚度 mm</label><input type="number" step="0.01" bind:value={editing.thickness_mm} /></div>
        <div class="field"><label>克重 gsm</label><input type="number" step="1" bind:value={editing.weight_gsm} /></div>
      </div>
      <div class="two">
        <div class="field"><label>纹理/帘纹</label><input bind:value={editing.weave} /></div>
        <div class="field"><label>pH</label><input type="number" step="0.1" bind:value={editing.ph} /></div>
      </div>
      <div class="field"><label>供应来源</label><input bind:value={editing.supplier} /></div>
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
    flex-wrap: wrap;
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
  .rec-layout {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 14px;
    padding: 0 22px 22px;
    align-items: start;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 14px;
  }
  .material {
    padding: 12px;
    list-style: none;
  }
  .top {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .swatch {
    width: 42px;
    height: 42px;
    border-radius: 4px;
    border: 1px solid var(--line);
    flex: none;
  }
  .material h3 {
    font-size: 14px;
  }
  .material p {
    margin: 6px 0 0;
    font-size: 12px;
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
    align-items: end;
    gap: 8px;
  }
  .color-row input[type='color'] {
    width: 42px;
    height: 32px;
    padding: 0;
  }
  .rec-bar {
    margin: 0 22px 8px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .rec-panel {
    padding: 12px;
    position: sticky;
    top: 14px;
  }
  .rec-panel h3 {
    font-size: 13px;
    margin-bottom: 8px;
  }
  .rec {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 8px;
  }
  .rec.top {
    border-color: var(--accent-soft);
    background: #fbf3ee;
  }
  .rec-head {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
  }
  .score {
    background: var(--paper-deep);
    border-radius: 99px;
    padding: 0 9px;
    font-size: 12px;
  }
  .meter {
    height: 5px;
    background: #ece2cd;
    border-radius: 99px;
    margin: 6px 0;
  }
  .meter i {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 99px;
  }
  .rec ul {
    font-size: 11px;
    color: #6f6150;
    padding-left: 14px;
  }
  .rec li {
    margin: 2px 0;
  }
</style>
