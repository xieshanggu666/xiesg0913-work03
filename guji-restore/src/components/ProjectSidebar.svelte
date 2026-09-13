<script lang="ts">
  import { api } from '../lib/api';
  import { currentProjectId, folios, projects } from '../lib/stores';
  import { createEventDispatcher } from 'svelte';
  import { guard, toast } from '../lib/toast';
  import { mediaUrl } from '../lib/api';

  const dispatch = createEventDispatcher<{ newproject: void }>();

  function select(id: string) {
    currentProjectId.set(id);
  }

  async function removeProject(e: Event, id: string, name: string) {
    e.stopPropagation();
    if (!confirm(`删除项目「${name}」？其全部本地数据（含原图副本）将被移除。`)) return;
    const r = await guard(api.projects.remove(id), '删除失败');
    if (r != null) {
      toast('项目已删除');
      if ($currentProjectId === id) currentProjectId.set(null);
      const list = await api.projects.list();
      projects.set(list);
      folios.set([]);
    }
  }
</script>

<aside class="sidebar">
  <div class="side-head">
    <h2>修复项目</h2>
    <button class="btn tiny" on:click={() => dispatch('newproject')}>＋</button>
  </div>
  <ul>
    {#each $projects as p}
      <li class:selected={$currentProjectId === p.id} on:click={() => select(p.id)}>
        <div class="p-name">{p.name}</div>
        <div class="p-meta">
          {p.shelf_no || '无馆藏号'} · {p.era || '年代不详'}
        </div>
        {#if $currentProjectId === p.id}
          <ul class="folio-mini">
            {#each $folios.filter((f) => f.project_id === p.id) as f}
              <li>
                <img src={mediaUrl(p.id, f.thumb_rel)} alt={f.name} />
                <span title={f.name}>{f.name}</span>
              </li>
            {/each}
          </ul>
        {/if}
        <button class="del" title="删除项目" on:click={(e) => removeProject(e, p.id, p.name)}>×</button>
      </li>
    {:else}
      <li class="empty">暂无项目，点“载入样例”快速体验</li>
    {/each}
  </ul>
</aside>

<style>
  .sidebar {
    background: #f0e8d8;
    border-right: 1px solid var(--line);
    overflow-y: auto;
  }
  .side-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
  }
  .side-head h2 {
    font-size: 14px;
    letter-spacing: 2px;
  }
  ul {
    padding: 0;
  }
  li {
    position: relative;
    padding: 10px 14px;
    border-bottom: 1px solid #e2d6bf;
    cursor: pointer;
  }
  li:hover {
    background: #eaddc7;
  }
  li.selected {
    background: #e4d4b4;
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .p-name {
    font-weight: 600;
    font-size: 13px;
    padding-right: 18px;
  }
  .p-meta {
    font-size: 11px;
    color: #8a7d6b;
    margin-top: 2px;
  }
  .del {
    position: absolute;
    top: 8px;
    right: 8px;
    border: none;
    background: none;
    color: #a78a66;
    font-size: 15px;
  }
  .del:hover {
    color: var(--accent);
  }
  .folio-mini {
    margin-top: 8px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .folio-mini li {
    padding: 0;
    border: none;
    cursor: default;
    text-align: center;
  }
  .folio-mini li:hover {
    background: none;
  }
  .folio-mini img {
    width: 100%;
    height: 52px;
    object-fit: cover;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: #f3eadb;
  }
  .folio-mini span {
    display: block;
    font-size: 10px;
    color: #7a6c52;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    padding: 18px 14px;
    font-size: 12px;
    color: #97856f;
    cursor: default;
  }
  .btn.tiny {
    padding: 2px 9px;
  }
</style>
