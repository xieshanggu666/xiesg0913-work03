<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { currentFolioId, currentProjectId, currentView, projects } from '../lib/stores';
  import { toast } from '../lib/toast';
  import {
    STAGE_META,
    STAGE_ORDER,
    type DashboardReport,
    type FolioStage,
    type RiskLevel
  } from '@shared/dashboard';
  import {
    DEFAULT_FILTER,
    DEFAULT_SORT,
    isDefaultFilter,
    folioRiskLevels,
    queryDashboard,
    type DashboardFilter,
    type DashboardSort,
    type RiskFilter,
    type StageFilter
  } from '@shared/dashboard-query';

  let report: DashboardReport | null = null;
  let loading = false;
  let loadError: string | null = null;
  let pid: string | null = null;

  // 分叶表与风险清单共用一组筛选/排序条件
  let filter: DashboardFilter = { ...DEFAULT_FILTER };
  let sort: DashboardSort = { ...DEFAULT_SORT };

  currentProjectId.subscribe((v) => {
    pid = v;
    report = null;
    loadError = null;
    filter = { ...DEFAULT_FILTER };
    sort = { ...DEFAULT_SORT };
    if (v) load(v);
  });
  onMount(() => {
    if (pid) load(pid);
  });

  async function load(id: string) {
    loading = true;
    loadError = null;
    try {
      const r = await api.dashboard.get(id);
      if (id === pid) report = r;
    } catch (e) {
      const msg = (e as Error).message || String(e);
      // 初次加载失败：页内展示错误状态并提供重试；刷新失败：保留旧数据，仅提示
      if (id === pid) {
        if (report) toast(`看板刷新失败：${msg}（仍显示上次数据）`, 'error');
        else loadError = msg;
      }
    } finally {
      if (id === pid) loading = false;
    }
  }

  function resetFilter() {
    filter = { ...DEFAULT_FILTER };
  }
  function setStage(stage: StageFilter) {
    filter = { ...filter, stage };
  }
  function setRisk(risk: RiskFilter) {
    filter = { ...filter, risk };
  }
  /** 选中态的分段按钮用对应阶段/等级色填充 */
  function chipStyle(on: boolean, color?: string): string {
    return on && color ? `background:${color};border-color:${color};color:#fff` : '';
  }

  $: project = $projects.find((p) => p.id === pid) ?? null;

  /** 跳到对应叶的标注页 */
  function goFolio(folioId: string | null) {
    if (!folioId) return;
    currentFolioId.set(folioId);
    currentView.set('annotate');
  }

  $: result = report
    ? queryDashboard(report, filter, sort)
    : { folios: [], risks: [] };
  $: filteredFolios = result.folios;
  $: filteredRisks = result.risks;
  // 每叶最高风险等级：分叶表角标用
  $: levelOfFolio = report ? folioRiskLevels(report.risks) : new Map<string, RiskLevel>();
  $: filtering = !isDefaultFilter(filter);

  const STAGE_COLORS: Record<FolioStage, string> = {
    imported: '#8a7d6b',
    annotated: '#1971c2',
    planned: '#0c8599',
    treated: '#e8890c',
    compared: '#2b8a3e'
  };

  const LEVEL_META: Record<RiskLevel, { label: string; color: string }> = {
    high: { label: '高风险', color: '#c92a2a' },
    medium: { label: '关注', color: '#e8890c' },
    low: { label: '提示', color: '#8a7d6b' }
  };

  const RISK_OPTIONS: { value: RiskFilter; label: string }[] = [
    { value: 'all', label: '全部等级' },
    { value: 'high', label: '高风险' },
    { value: 'medium', label: '关注' },
    { value: 'low', label: '提示' }
  ];

  const stagePct = (stage: FolioStage) => Math.round((STAGE_ORDER.indexOf(stage) / (STAGE_ORDER.length - 1)) * 100);
</script>

<div class="dash-wrap">
  <div class="view-head">
    <h2>项目进度与风险看板</h2>
    {#if project}<span class="muted">「{project.name}」 · {project.shelf_no || '无馆藏号'}</span>{/if}
    <div class="spacer"></div>
    {#if report}<span class="muted">生成于 {report.generated_at.slice(0, 19).replace('T', ' ')}</span>{/if}
    <button class="btn tiny secondary" on:click={() => pid && load(pid)} disabled={loading || !pid}>
      {loading ? '统计中…' : '刷新'}
    </button>
  </div>

  {#if !pid}
    <div class="empty state-block">
      尚未选择项目，请在左侧选择一个项目，或在顶部「新建项目 / 载入样例」。
    </div>
  {:else if loading && !report}
    <div class="empty state-block">正在汇总项目数据…</div>
  {:else if loadError}
    <div class="state-block error-state" role="alert">
      <b>看板加载失败</b>
      <p>{loadError}</p>
      <p class="muted">可检查数据目录是否可读写后重试；本地已有数据不会受影响。</p>
      <button class="btn" on:click={() => pid && load(pid)}>{loading ? '重试中…' : '重新加载'}</button>
    </div>
  {:else if !report}
    <div class="empty state-block">暂无数据</div>
  {:else}
    <div class="metrics card">
      <div class="completion">
        <b>{report.completion}%</b>
        <span>总体进度</span>
        <div class="bar"><i style={`width:${report.completion}%`}></i></div>
      </div>
      <div><b>{report.totals.folios}</b><span>扫描叶</span></div>
      <div><b>{report.totals.damageShapes}</b><span>破损标注</span></div>
      <div><b>{report.totals.repairShapes}</b><span>修补方案</span></div>
      <div><b>{report.totals.steps}</b><span>工序记录</span></div>
      <div class:warn={report.totals.unresolvedComments > 0}>
        <b>{report.totals.unresolvedComments}</b><span>未解决批注</span>
      </div>
      <div><b>{report.totals.afterImages}</b><span>修复后图</span></div>
    </div>

    <!-- 筛选与排序：阶段 / 风险等级 / 叶名称同时作用于分叶表与风险清单 -->
    <div class="toolbar card" aria-label="看板筛选与排序">
      <div class="filter-group">
        <span class="filter-label">阶段</span>
        <div class="chips" role="group" aria-label="按阶段筛选">
          <button
            class="btn tiny ghost"
            class:on={filter.stage === 'all'}
            style={chipStyle(filter.stage === 'all')}
            on:click={() => setStage('all')}
          >全部</button>
          {#each STAGE_ORDER as stage}
            <button
              class="btn tiny ghost chip-stage"
              class:on={filter.stage === stage}
              style={chipStyle(filter.stage === stage, STAGE_COLORS[stage])}
              on:click={() => setStage(stage)}
            >
              <i class="dot" style={`background:${STAGE_COLORS[stage]}`}></i>{STAGE_META[stage].label}
            </button>
          {/each}
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label">风险</span>
        <div class="chips" role="group" aria-label="按风险等级筛选">
          {#each RISK_OPTIONS as opt}
            <button
              class="btn tiny ghost"
              class:on={filter.risk === opt.value}
              style={chipStyle(filter.risk === opt.value, opt.value === 'all' ? undefined : LEVEL_META[opt.value].color)}
              on:click={() => setRisk(opt.value)}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <div class="filter-group grow">
        <span class="filter-label">叶名称</span>
        <div class="search-box">
          <input
            type="search"
            bind:value={filter.query}
            placeholder="按叶名筛选，如：第三叶 / 虫蛀…"
            aria-label="按叶名称筛选"
          />
          {#if filter.query}
            <button class="clear" on:click={() => (filter = { ...filter, query: '' })} aria-label="清空叶名" title="清空">×</button>
          {/if}
        </div>
      </div>

      <label class="sort">
        排序
        <select bind:value={sort.key} aria-label="排序字段">
          <option value="default">按叶序（默认）</option>
          <option value="name">按叶名称</option>
          <option value="stage">按阶段</option>
        </select>
        <button
          class="btn tiny ghost"
          on:click={() => (sort = { ...sort, asc: !sort.asc })}
          title="切换升序/降序"
        >
          {sort.asc ? '升序 ↑' : '降序 ↓'}
        </button>
      </label>

      {#if filtering}
        <button class="btn tiny ghost" on:click={resetFilter}>清除筛选</button>
      {/if}

      <span class="count">
        叶 {filteredFolios.length}/{report.folios.length} · 风险 {filteredRisks.length}/{report.risks.length}
      </span>
    </div>

    <div class="grid">
      <section class="card">
        <h3>修复流水线（按叶统计到达阶段）</h3>
        <div class="funnel">
          {#each STAGE_ORDER as stage}
            {@const n = report.stageReached[stage]}
            {@const pct = report.totals.folios ? Math.round((n / report.totals.folios) * 100) : 0}
            <div class="stage">
              <div class="stage-head">
                <span class="tag" style={`background:${STAGE_COLORS[stage]}`}>{STAGE_META[stage].label}</span>
                <b>{n}</b><span class="muted">/ {report.totals.folios} 叶</span>
              </div>
              <div class="bar"><i style={`width:${pct}%;background:${STAGE_COLORS[stage]}`}></i></div>
              <div class="muted hint">{STAGE_META[stage].hint}</div>
            </div>
          {/each}
        </div>

        <h3 style="margin-top:18px">分叶进度</h3>
        {#if report.folios.length === 0}
          <div class="empty inner">尚未导入扫描叶。</div>
        {:else if filteredFolios.length === 0}
          <div class="empty inner no-result">
            没有符合当前筛选条件的叶。
            <button class="link" on:click={resetFilter}>清除筛选</button>
            后查看全部 {report.folios.length} 叶。
          </div>
        {:else}
          <table>
            <thead>
              <tr>
                <th>叶</th><th>阶段</th><th>风险</th><th>破损</th><th>方案</th><th>工序</th><th>对照图</th><th style="width:24%">进度</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredFolios as f (f.folio_id)}
                {@const level = levelOfFolio.get(f.folio_id)}
                <tr class="folio-row">
                  <td class="fname">
                    <button class="link" on:click={() => goFolio(f.folio_id)} title="前往标注页">{f.name}</button>
                  </td>
                  <td><span class="tag" style={`background:${STAGE_COLORS[f.stage]}`}>{STAGE_META[f.stage].label}</span></td>
                  <td>
                    {#if level}
                      <span class="tag" style={`background:${LEVEL_META[level].color}`}>{LEVEL_META[level].label}</span>
                    {:else}
                      <span class="muted">—</span>
                    {/if}
                  </td>
                  <td>{f.damageCount || '—'}</td>
                  <td>{f.repairCount || '—'}</td>
                  <td>{f.stepCount || '—'}</td>
                  <td>{f.hasAfter ? '✓' : '—'}</td>
                  <td><div class="bar slim"><i style={`width:${stagePct(f.stage)}%;background:${STAGE_COLORS[f.stage]}`}></i></div></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>

      <section class="card">
        <h3>风险清单（{filtering ? `${filteredRisks.length}/${report.risks.length}` : report.risks.length}）</h3>
        {#if report.risks.length === 0}
          <div class="empty inner">当前没有触发任何风险规则，继续保持留痕习惯。</div>
        {:else if filteredRisks.length === 0}
          <div class="empty inner no-result">
            没有符合当前筛选条件的风险条目。
            <button class="link" on:click={resetFilter}>清除筛选</button>
            后查看全部 {report.risks.length} 条。
          </div>
        {:else}
          <ul class="risks">
            {#each filteredRisks as r (r.code + (r.folio_id ?? '') + r.title)}
              <li>
                <span class="tag" style={`background:${LEVEL_META[r.level].color}`}>{LEVEL_META[r.level].label}</span>
                <div class="rbody">
                  <b>{r.title}</b>
                  <p>{r.detail}</p>
                </div>
                {#if r.folio_id}
                  <button class="btn tiny ghost" on:click={() => goFolio(r.folio_id)}>前往该叶</button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}

        {#if report.damageByKind.length}
          <h3 style="margin-top:16px">破损构成</h3>
          <ul class="kinds">
            {#each report.damageByKind as d}
              <li>
                <span>{d.label}</span>
                <div class="bar slim"><i style={`width:${Math.round((d.count / report.totals.damageShapes) * 100)}%`}></i></div>
                <b>{d.count}</b>
              </li>
            {/each}
          </ul>
          <p class="muted">破损面积合计约 {report.totals.damagedAreaPx.toLocaleString()} px²（按标注几何估算）。</p>
        {/if}

        {#if report.techniqueCounts.length}
          <h3 style="margin-top:16px">工艺分布</h3>
          <ul class="techs">
            {#each report.techniqueCounts as t}
              <li><span class="tag" style="background:var(--green)">{t.technique}</span><b>× {t.count}</b></li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .dash-wrap {
    overflow-y: auto;
    padding-bottom: 30px;
  }
  .view-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 22px 0;
  }
  .view-head h2 {
    font-size: 17px;
  }
  .spacer {
    flex: 1;
  }
  .muted {
    color: #8a7d6b;
    font-size: 12px;
  }
  .state-block {
    margin: 18px 22px;
    background: #f5eddc;
    border: 1px dashed var(--line);
    border-radius: 8px;
  }
  .error-state {
    text-align: center;
    padding: 34px 20px;
  }
  .error-state b {
    font-size: 15px;
    color: #c92a2a;
  }
  .error-state p {
    margin: 8px 0;
    font-size: 13px;
  }
  .error-state .btn {
    margin-top: 8px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    margin: 12px 22px;
    padding: 10px 14px;
  }
  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .filter-group.grow {
    flex: 1 1 220px;
    min-width: 240px;
  }
  .filter-label {
    font-size: 12px;
    color: #6f6150;
    white-space: nowrap;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chips .btn.on {
    background: #e3d6bb;
    border-color: #b8a583;
    color: var(--ink);
  }
  .chip-stage .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 4px;
  }
  .search-box {
    position: relative;
    flex: 1;
    min-width: 180px;
    max-width: 320px;
  }
  .search-box input {
    width: 100%;
    padding: 5px 26px 5px 10px;
    font-size: 13px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fffefa;
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
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fffefa;
  }
  .count {
    font-size: 12px;
    color: #8a7d6b;
    white-space: nowrap;
  }
  .metrics {
    display: grid;
    grid-template-columns: 2fr repeat(6, 1fr);
    gap: 8px;
    margin: 14px 22px 0;
    padding: 14px 16px;
    text-align: center;
  }
  .metrics > div {
    background: #f5eddc;
    border-radius: 6px;
    padding: 10px 6px;
  }
  .metrics b {
    display: block;
    font-size: 18px;
  }
  .metrics span {
    font-size: 11px;
    color: #8a7d6b;
  }
  .metrics .warn b {
    color: #c92a2a;
  }
  .metrics .completion {
    text-align: left;
    padding: 10px 14px;
  }
  .metrics .completion b {
    font-size: 22px;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(420px, 3fr) minmax(320px, 2fr);
    gap: 14px;
    padding: 14px 22px 0;
    align-items: start;
  }
  section.card {
    padding: 16px 18px;
  }
  h3 {
    font-size: 13px;
    letter-spacing: 1px;
    color: #6f6150;
    margin-bottom: 10px;
  }
  .funnel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .stage-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .hint {
    margin-top: 2px;
  }
  .bar {
    height: 8px;
    background: #eee3cc;
    border-radius: 99px;
    overflow: hidden;
    margin-top: 6px;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 99px;
  }
  .bar.slim {
    height: 6px;
    margin-top: 0;
    min-width: 60px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    font-size: 11px;
    color: #8a7d6b;
    font-weight: 500;
    padding: 4px 8px 6px;
    border-bottom: 1px solid var(--line);
  }
  td {
    padding: 7px 8px;
    border-bottom: 1px solid #efe6d2;
  }
  .folio-row:hover td {
    background: #faf4e6;
  }
  .fname {
    font-weight: 500;
  }
  .fname .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--blue);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .empty.inner {
    padding: 24px 12px;
  }
  .no-result .link {
    border: none;
    background: none;
    color: var(--accent);
    cursor: pointer;
    font-size: inherit;
    padding: 0 2px;
    text-decoration: underline;
  }
  .risks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .risks li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    background: #f8f2e4;
    border: 1px solid #eadfc6;
    border-radius: 6px;
    padding: 8px 10px;
  }
  .risks li .btn {
    flex: none;
    margin-top: 1px;
  }
  .risks .tag {
    flex: none;
    margin-top: 2px;
  }
  .rbody {
    flex: 1;
  }
  .rbody b {
    font-size: 13px;
  }
  .rbody p {
    margin: 3px 0 0;
    font-size: 12px;
    color: #6f6150;
  }
  .kinds li {
    display: grid;
    grid-template-columns: 56px 1fr 30px;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    margin-bottom: 6px;
  }
  .kinds b {
    text-align: right;
    color: #6f6150;
  }
  .techs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .techs li {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
  }
  .techs b {
    color: #6f6150;
  }
</style>
