<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { api } from '../lib/api';
  import { guard, toast } from '../lib/toast';

  const dispatch = createEventDispatcher<{ done: { id: string } }>();
  let name = '';
  let author = '';
  let shelf_no = '';
  let era = '';
  let description = '';
  let saving = false;

  async function submit() {
    if (!name.trim()) {
      toast('请填写项目名称', 'error');
      return;
    }
    saving = true;
    const p = await guard(
      api.projects.create({ name: name.trim(), author: author.trim(), shelf_no: shelf_no.trim(), era: era.trim(), description }),
      '新建项目失败'
    );
    saving = false;
    if (p) {
      toast(`已创建项目「${p.name}」`);
      dispatch('done', { id: p.id });
    }
  }
</script>

<div>
  <div class="field">
    <label for="p-name">项目 / 书名 *</label>
    <input id="p-name" bind:value={name} placeholder="如：稼轩长短句（卷一）" />
  </div>
  <div class="field">
    <label for="p-author">建档人</label>
    <input id="p-author" bind:value={author} placeholder="修复师姓名" />
  </div>
  <div class="field">
    <label for="p-shelf">馆藏号 / 书号</label>
    <input id="p-shelf" bind:value={shelf_no} placeholder="如：善 02314" />
  </div>
  <div class="field">
    <label for="p-era">年代</label>
    <input id="p-era" bind:value={era} placeholder="如：明刻本 / 清抄本" />
  </div>
  <div class="field">
    <label for="p-desc">说明</label>
    <textarea id="p-desc" bind:value={description} placeholder="破损概况、修复目标…"></textarea>
  </div>
  <div class="actions">
    <button class="btn ghost" on:click={() => dispatch('done')}>取消</button>
    <button class="btn" on:click={submit} disabled={saving}>{saving ? '创建中…' : '创建'}</button>
  </div>
</div>
