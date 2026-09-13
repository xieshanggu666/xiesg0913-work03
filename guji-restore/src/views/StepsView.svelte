<script lang="ts">
  import { api } from '../lib/api';
  import { currentProjectId, folios, materials, operator, steps } from '../lib/stores';
  import { guard, toast } from '../lib/toast';
  import { TECHNIQUES } from '@shared/constants';

  let editing: any = null;

  function blank() {
    return {
      title: '',
      technique: TECHNIQUES[0],
      folio_id: '',
      material_ids: [],
      operator: $operator,
      performed_at: new Date().toISOString().slice(0, 10),
      duration_min: '',
      note: ''
    };
  }

  async function save() {
    const pid = $currentProjectId;
    if (!pid || !editing.title.trim()) return toast('请填写工序名称', 'error');
    const payload = {
      project_id: pid,
      folio_id: editing.folio_id || null,
      order_index: editing.id
        ? steps.find((s) => s.id === editing.id)?.order_index ?? $steps.length + 1
        : $steps.length + 1,
      title: editing.title.trim(),
      technique: editing.technique,
      material_ids: editing.material_ids,
      operator: editing.operator || '修复师',
      performed_at: editing.performed_at,
      duration_min: editing.duration_min === '' ? null : Number(editing.duration_min),
      photo_rel: null,
      note: editing.note
    };
    const r = editing.id
      ? await guard(api.steps.update(editing.id, payload), '保存失败')
      : await guard(api.steps.create(payload), '新建工序失败');
    if (r) {
      editing = null;
      steps.set(await api.steps.list(pid));
      toast('工序已记录');
    }
  }
  async function remove(id: string) {
    if (!confirm('删除该道工序记录？')) return;
    await guard(api.steps.remove(id), '删除失败');
    steps.set(await api.steps.list($currentProjectId));
  }
  async function move(id: string, dir: -1 | 1) {
    const list = [...$steps].sort((a, b) => a.order_index - b.order_index);
    const i = list.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    await guard(api.steps.update(id, { order_index: list[j].order_index }), '调整失败');
    await guard(api.steps.update(list[j].id, { order_index: list[i].order_index }), '调整失败');
    steps.set(await api.steps.list($currentProjectId));
  }
  function matName(id: string) {
    return $materials.find((m) => m.id === id)?.name ?? id;
  }
</script>

<div class="view-head">
  <h2>修复工序记录</h2>
  <div class="spacer"></div>
  <button class="btn secondary" on:click={() => (editing = blank())}>＋ 记一道工序</button>
</div>

<ol class="step-list">
  {#each [...$steps].sort((a, b) => a.order_index - b.order_index) as s, i}
    <li class="card step">
      <div class="ord">{s.order_index}</div>
      <div class="body">
        <h3>{s.title}</h3>
        <div class="meta">
          <span class="tag" style="background:var(--green)">{s.technique}</span>
          {s.folio_id ? $folios.find((f) => f.id === s.folio_id)?.name : '整卷'}
          <span class="muted">· {s.operator} · {s.performed_at.slice(0, 10)}</span>
          {#if s.duration_min}<span class="muted"> · {s.duration_min} 分钟</span>{/if}
        </div>
        {#if s.material_ids.length}
          <div class="mats">用材：{s.material_ids.map(matName).join('、')}</div>
        {/if}
        {#if s.note}<p class="note">{s.note}</p>{/if}
      </div>
      <div class="ops">
        <button class="btn tiny ghost" on:click={() => move(s.id, -1)} disabled={i === 0}>↑</button>
        <button class="btn tiny ghost" on:click={() => move(s.id, 1)} disabled={i === $steps.length - 1}>↓</button>
        <button class="btn tiny ghost" on:click={() => (editing = { ...s, folio_id: s.folio_id ?? '', material_ids: [...s.material_ids], duration_min: s.duration_min ?? '' })}>编辑</button>
        <button class="btn tiny ghost" on:click={() => remove(s.id)}>删除</button>
      </div>
    </li>
  {/each}
</ol>

{#if $steps.length === 0}
  <div class="empty">尚无工序记录，从“记一道工序”开始按施作顺序留痕。</div>
{/if}

{#if editing}
  <div class="modal-backdrop" on:click={() => (editing = null)}>
    <div class="modal" on:click|stopPropagation>
      <h3>{editing.id ? '编辑工序' : '新建工序'}</h3>
      <div class="two">
        <div class="field"><label>工序名称 *</label><input bind:value={editing.title} placeholder="如：虫孔嵌补" /></div>
        <div class="field">
          <label>工艺</label>
          <select bind:value={editing.technique}>
            {#each TECHNIQUES as t}<option value={t}>{t}</option>{/each}
          </select>
        </div>
      </div>
      <div class="two">
        <div class="field">
          <label>对应叶次</label>
          <select bind:value={editing.folio_id}>
            <option value="">整卷级</option>
            {#each $folios as f}<option value={f.id}>{f.name}</option>{/each}
          </select>
        </div>
        <div class="field"><label>施作日期</label><input type="date" bind:value={editing.performed_at} /></div>
      </div>
      <div class="two">
        <div class="field"><label>修复师</label><input bind:value={editing.operator} /></div>
        <div class="field"><label>耗时（分钟）</label><input type="number" bind:value={editing.duration_min} /></div>
      </div>
      <div class="field">
        <label>使用材料（可多选）</label>
        <select multiple bind:value={editing.material_ids} size="4">
          {#each $materials as m}<option value={m.id}>{m.name}</option>{/each}
        </select>
      </div>
      <div class="field"><label>记录</label><textarea bind:value={editing.note} placeholder="操作要点、异常、可逆性说明…"></textarea></div>
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
  .step-list {
    padding: 14px 22px 30px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .step {
    display: flex;
    gap: 14px;
    padding: 14px 16px;
    align-items: flex-start;
  }
  .ord {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex: none;
  }
  .step .body {
    flex: 1;
  }
  .step h3 {
    font-size: 14px;
    margin-bottom: 4px;
  }
  .meta {
    font-size: 12px;
    color: var(--ink-soft);
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .mats {
    font-size: 12px;
    margin-top: 6px;
    color: #6f6150;
  }
  .note {
    font-size: 13px;
    margin: 6px 0 0;
    white-space: pre-wrap;
  }
  .ops {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
  select[multiple] {
    height: 88px;
  }
</style>
