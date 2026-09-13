<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { api } from '../lib/api';
  import { comments, currentFolioId, currentProjectId, folios, operator } from '../lib/stores';
  import { guard, toast } from '../lib/toast';

  const dispatch = createEventDispatcher();
  let body = '';

  async function send() {
    const pid = $currentProjectId;
    if (!pid || !body.trim()) return;
    const c = await guard(
      api.comments.create({
        project_id: pid,
        folio_id: $currentFolioId,
        target_type: 'project',
        author: $operator || '匿名',
        body: body.trim()
      }),
      '发送批注失败'
    );
    if (c) {
      body = '';
      comments.update((list) => [...list, c]);
    }
  }

  async function resolve(id: string, resolved: boolean) {
    const c = await guard(api.comments.resolve(id, resolved), '更新批注失败');
    if (c) comments.update((list) => list.map((x) => (x.id === id ? c : x)));
  }
  async function remove(id: string) {
    if (!confirm('删除该批注？')) return;
    const r = await guard(api.comments.remove(id), '删除批注失败');
    if (r != null) comments.update((list) => list.filter((x) => x.id !== id));
  }

  function folioName(id: string | null): string {
    return $folios.find((f) => f.id === id)?.name ?? '项目级';
  }
</script>

<div class="modal-backdrop" on:click={() => dispatch('close')}>
  <div class="modal comments-modal" on:click|stopPropagation>
    <h3>多人批注</h3>
    <p class="muted" style="margin:0 0 12px">针对当前项目；批注会随修复档案一并导出。</p>
    <ul class="c-list">
      {#each $comments as c}
        <li class:resolved={c.resolved}>
          <div class="c-head">
            <b>{c.author}</b>
            <span class="where">{folioName(c.folio_id)}</span>
            <span class="when">{c.created_at.slice(0, 10)}</span>
          </div>
          <div class="c-body">{c.body}</div>
          <div class="c-actions">
            <button class="btn tiny ghost" on:click={() => resolve(c.id, !c.resolved)}>
              {c.resolved ? '重新打开' : '标记解决'}
            </button>
            <button class="btn tiny ghost" on:click={() => remove(c.id)}>删除</button>
          </div>
        </li>
      {/each}
    </ul>
    <div class="composer">
      <textarea bind:value={body} placeholder="写下意见（材料选择、补纸比色、施作要点…）"></textarea>
      <div class="actions">
        <button class="btn ghost" on:click={() => dispatch('close')}>关闭</button>
        <button class="btn" on:click={send}>发表（{$operator || '匿名'}）</button>
      </div>
    </div>
  </div>
</div>

<style>
  .comments-modal {
    width: 560px;
  }
  .c-list {
    max-height: 50vh;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    margin-bottom: 12px;
  }
  .c-list li {
    padding: 10px 12px;
    border-bottom: 1px solid #eee4d2;
  }
  .c-list li.resolved .c-body {
    opacity: 0.5;
    text-decoration: line-through;
  }
  .c-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 12px;
    color: var(--ink-soft);
    margin-bottom: 4px;
  }
  .c-head .where {
    background: var(--paper-deep);
    border-radius: 99px;
    padding: 0 8px;
  }
  .c-head .when {
    margin-left: auto;
    color: #a7987d;
  }
  .c-body {
    font-size: 13px;
    line-height: 1.6;
  }
  .c-actions {
    margin-top: 6px;
    display: flex;
    gap: 6px;
  }
  .composer textarea {
    width: 100%;
    min-height: 70px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
</style>
