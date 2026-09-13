<script lang="ts">
  import { onMount } from 'svelte';
  import { api, isElectron } from './lib/api';
  import {
    busy,
    comments,
    currentFolioId,
    currentProjectId,
    currentView,
    folios,
    layers,
    materials,
    operator,
    projects,
    samples,
    shapes,
    steps,
    type ViewKey
  } from './lib/stores';
  import { guard, toast } from './lib/toast';
  import Modal from './components/Modal.svelte';
  import ProjectForm from './components/ProjectForm.svelte';
  import ProjectSidebar from './components/ProjectSidebar.svelte';
  import AnnotateView from './views/AnnotateView.svelte';
  import SamplesView from './views/SamplesView.svelte';
  import MaterialsView from './views/MaterialsView.svelte';
  import StepsView from './views/StepsView.svelte';
  import CompareView from './views/CompareView.svelte';
  import ArchiveView from './views/ArchiveView.svelte';
  import DashboardView from './views/DashboardView.svelte';
  import CommentsPanel from './components/CommentsPanel.svelte';
  import { recommendSampleId } from './lib/stores';

  let showNewProject = false;
  let showComments = false;
  let dataDir = '';
  let currentOperator = '';
  operator.subscribe((v) => (currentOperator = v));

  const TABS: { key: ViewKey; label: string }[] = [
    { key: 'dashboard', label: '进度看板' },
    { key: 'annotate', label: '扫描标注' },
    { key: 'samples', label: '纸墨样本' },
    { key: 'materials', label: '材料推荐' },
    { key: 'steps', label: '修复工序' },
    { key: 'compare', label: '前后对比' },
    { key: 'archive', label: '修复档案' }
  ];

  async function refreshProjects() {
    const list = await guard(api.projects.list(), '读取项目失败');
    if (list) projects.set(list);
  }

  let currentPid: string | null = null;
  currentProjectId.subscribe((v) => (currentPid = v));

  $: if (currentPid) loadProjectData(currentPid);

  let loadToken = 0;
  async function loadProjectData(pid: string) {
    const myToken = ++loadToken;
    const [fl, sm, ms, st, cm] = await Promise.all([
      api.folios.list(pid),
      api.samples.list(),
      api.materials.list(),
      api.steps.list(pid),
      api.comments.list(pid)
    ]);
    if (myToken !== loadToken) return;
    folios.set(fl);
    samples.set(sm);
    materials.set(ms);
    steps.set(st);
    comments.set(cm);
    const firstFolio = fl[0]?.id ?? null;
    currentFolioId.set(firstFolio);
    if (!firstFolio) {
      layers.set([]);
      shapes.set([]);
    }
  }

  let currentFolio: string | null = null;
  currentFolioId.subscribe((v) => (currentFolio = v));
  $: if (currentPid && currentFolio) loadFolioLayers(currentFolio);

  async function loadFolioLayers(fid: string) {
    const [ls, ss] = await Promise.all([api.layers.list(fid), api.shapes.list(fid)]);
    layers.set(ls);
    shapes.set(ss);
  }

  async function importSamples() {
    busy.set(true);
    const r = await guard(api.app.importSamples(currentOperator || '修复师'), '导入样例失败');
    busy.set(false);
    if (!r) return;
    toast(`已导入内置样例：${r.folioCount} 叶`);
    await refreshProjects();
    currentProjectId.set(r.projectId);
  }

  async function pickImport() {
    const files = await api.dialog.pickImages();
    if (!files.length || !currentPid) return;
    busy.set(true);
    const r = await guard(api.folios.import(currentPid, files), '导入扫描失败');
    busy.set(false);
    if (r) {
      toast(`已导入 ${r.length} 张扫描（原图已只读保存）`);
      await loadProjectData(currentPid);
    }
  }

  onMount(async () => {
    if (isElectron) dataDir = await api.app.getDataDir();
    await refreshProjects();
  });

  function goRecommend(sampleId: string) {
    recommendSampleId.set(sampleId);
    currentView.set('materials');
  }

  async function afterProjectCreated(detail: { id?: string } | undefined) {
    showNewProject = false;
    const list = await api.projects.list();
    projects.set(list);
    currentProjectId.set(detail?.id ?? list[0]?.id ?? null);
  }
</script>

<div class="app-shell">
  <header class="topbar">
    <div class="brand">古籍修复工作台 <small>Guji Restore · 离线版</small></div>
    <nav>
      {#each TABS as t}
        <button class:active={$currentView === t.key} on:click={() => currentView.set(t.key)}>{t.label}</button>
      {/each}
    </nav>
    <div class="spacer"></div>
    <div class="operator">
      修复师
      <input bind:value={currentOperator} placeholder="姓名（多人批注署名）" style="width:118px;background:#4a3f36;border:1px solid #5c5145;color:#f3ead9;border-radius:4px;padding:4px 8px" />
    </div>
    <button class="btn tiny" on:click={() => (showComments = true)}>批注</button>
    <button class="btn tiny secondary" on:click={importSamples}>载入样例</button>
    <button class="btn tiny" on:click={pickImport} disabled={!currentPid}>导入扫描</button>
    <button class="btn tiny secondary" on:click={() => (showNewProject = true)}>新建项目</button>
  </header>

  <div class="body-row">
    <ProjectSidebar on:newproject={() => (showNewProject = true)} />
    <main class="content-area">
      {#if !currentPid}
        <div class="empty card" style="margin:40px;padding:60px">
          <h2>从新建项目或“载入样例”开始</h2>
          <p class="muted" style="margin-top:10px">
            原图会复制为只读副本（SHA-256 校验），标注、版本、工序全部保存在本机 SQLite，无需联网。
          </p>
          {#if dataDir}<p class="muted">数据目录：{dataDir}</p>{/if}
          <div style="margin-top:18px;display:flex;gap:10px">
            <button class="btn" on:click={() => (showNewProject = true)}>新建修复项目</button>
            <button class="btn secondary" on:click={importSamples}>载入内置三页样例</button>
          </div>
        </div>
      {:else if $currentView === 'annotate'}
        <AnnotateView />
      {:else if $currentView === 'samples'}
        <SamplesView on:recommend={(e) => goRecommend(e.detail)} />
      {:else if $currentView === 'materials'}
        <MaterialsView />
      {:else if $currentView === 'steps'}
        <StepsView />
      {:else if $currentView === 'compare'}
        <CompareView />
      {:else if $currentView === 'dashboard'}
        <DashboardView />
      {:else}
        <ArchiveView />
      {/if}
    </main>
  </div>
</div>

{#if showNewProject}
  <Modal title="新建修复项目" on:close={() => (showNewProject = false)}>
    <ProjectForm on:done={(e) => afterProjectCreated(e.detail)} />
  </Modal>
{/if}

{#if showComments}
  <CommentsPanel on:close={() => (showComments = false)} />
{/if}

<style>
  .body-row {
    display: grid;
    grid-template-columns: 240px 1fr;
    flex: 1;
    min-height: 0;
  }
  .content-area {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
