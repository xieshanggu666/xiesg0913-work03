<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { api } from '../lib/api';
  import { operator } from '../lib/stores';
  import { guard, toast } from '../lib/toast';
  import type { PlanVersion } from '@shared/types';

  export let folioId: string;
  const dispatch = createEventDispatcher<{ close: void; restored: void }>();

  let versions: PlanVersion[] = [];
  let label = '';
  let note = '';
  let busy = false;
  let currentOperator = '';
  operator.subscribe((v) => (currentOperator = v));

  async function load() {
    versions = await api.versions.list(folioId);
  }
  load();

  async function save() {
    if (!label.trim()) {
      toast('请填写版本说明', 'error');
      return;
    }
    busy = true;
    const v = await guard(api.versions.save(folioId, { label: label.trim(), note, author: currentOperator || '修复师' }), '保存版本失败');
    busy = false;
    if (v) {
      toast(`已存为 v${v.version}`);
      label = '';
      note = '';
      load();
    }
  }

  async function restore(v: PlanVersion) {
    if (!confirm(`回退到 v${v.version}「${v.label}」？\n回退前会自动保存当前状态，因此回退本身可撤销。`)) return;
    busy = true;
    const r = await guard(api.versions.restore(v.id, currentOperator || '修复师'), '版本回退失败');
    busy = false;
    if (r) {
      toast(`已回退到 v${r.version}`);
      dispatch('restored');
      dispatch('close');
    }
  }
</script>

<div class="modal-backdrop" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <h3>方案版本</h3>
    <p class="muted" style="margin:0 0 10px">
      每次存版保存全部图层与破损标注；回退会先自动备份当前状态，可再次回到回退前。
    </p>
    <div class="field">
      <label>新版本说明</label>
      <input bind:value={label} placeholder="如：初勘 / 补纸方案定稿 / 张老师批注后修订" />
    </div>
    <div class="field">
      <label>备注</label>
      <textarea bind:value={note} placeholder="本版判断依据、采用材料…"></textarea>
    </div>
    <div class="actions">
      <span class="muted">署名：{currentOperator || '修复师'}</span>
      <button class="btn" on:click={save} disabled={busy}>存为新版本</button>
    </div>

    <h3 style="margin-top:18px">历史版本</h3>
    <ul class="versions">
      {#each versions as v}
        <li>
          <div class="v-head">
            <b>v{v.version}</b>
            <span class="tag" style="background:var(--green)">{v.snapshot.shapes.length} 处标注</span>
            <time>{v.created_at.slice(0, 16).replace('T', ' ')}</time>
          </div>
          <div class="v-label">{v.label}</div>
          {#if v.note}<div class="muted v-note">{v.note}</div>{/if}
          <div class="v-foot muted">{v.author} · {v.snapshot.layers.length} 层</div>
          <button class="btn tiny secondary" on:click={() => restore(v)} disabled={busy}>回退到此版本</button>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button class="btn ghost" on:click={() => dispatch('close')}>关闭</button>
    </div>
  </div>
</div>

<style>
  .versions {
    border: 1px solid var(--line);
    border-radius: 6px;
    max-height: 40vh;
    overflow-y: auto;
  }
  .versions li {
    padding: 10px 12px;
    border-bottom: 1px solid #eee4d2;
  }
  .v-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .v-head time {
    margin-left: auto;
    font-size: 11px;
    color: #a7987d;
  }
  .v-label {
    margin: 4px 0;
  }
  .v-note {
    font-size: 12px;
  }
  .v-foot {
    font-size: 11px;
    margin: 2px 0 6px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }
  .actions .muted {
    margin-right: auto;
  }
</style>
