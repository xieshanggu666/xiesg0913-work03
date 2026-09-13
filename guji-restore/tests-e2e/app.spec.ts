import { expect, test } from '@playwright/test';

// 针对构建产物 + 浏览器内存 Mock API（无需 Electron/显示环境）
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('应用外壳与导航', async ({ page }) => {
  await expect(page.locator('.brand')).toContainText('古籍修复工作台');
  for (const label of ['进度看板', '扫描标注', '纸墨样本', '材料推荐', '修复工序', '前后对比', '修复档案']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  }
});

test('进度看板：阶段漏斗与风险清单', async ({ page }) => {
  await page.getByRole('button', { name: '载入样例' }).click();
  await expect(page.getByText('《稼轩长短句》样卷')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '进度看板' }).click();
  await expect(page.getByRole('heading', { name: '项目进度与风险看板' })).toBeVisible();
  // 样例第三叶走完全链路（有修复后图）→ 出现“已对比”阶段
  await expect(page.locator('.funnel').getByText('已对比')).toBeVisible();
  // 样例预置两条未解决批注 → 触发“批注未闭环”风险
  await expect(page.locator('.risks').getByText('批注未闭环')).toBeVisible();
  // 分叶表列出三叶，点击叶名跳回标注页
  await expect(page.locator('.folio-row')).toHaveCount(3);
  await page.locator('.folio-row .link').first().click();
  await expect(page.locator('.folio-strip')).toBeVisible();
});

test('进度看板：阶段/风险/叶名筛选、排序与无结果状态，风险可跳转对应叶', async ({ page }) => {
  // 与同文件其他用例隔离：清空浏览器内存 Mock 库后重新载入样例
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '载入样例' }).click();
  await expect(page.getByText('《稼轩长短句》样卷')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '进度看板' }).click();

  const toolbar = page.locator('.toolbar');
  const folioRows = page.locator('.folio-row');
  const riskItems = page.locator('.risks li');
  await expect(folioRows).toHaveCount(3);
  const totalRisks = await riskItems.count();
  expect(totalRisks).toBeGreaterThan(0);

  // 阶段筛选：点「已对比」后只剩第三叶（样例中唯一走完全链路的叶）
  await toolbar.getByRole('button', { name: /已对比/ }).click();
  await expect(folioRows).toHaveCount(1);
  await expect(folioRows.first()).toContainText('卷一·第三叶（虫蛀）');

  // 前两叶仅导入、无任何风险：切到「已导入」后分叶表 2 行、风险清单 0 条，
  // 项目级风险（无关联叶）在阶段筛选下被排除，给出无结果状态
  await toolbar.getByRole('button', { name: /已导入/ }).click();
  await expect(folioRows).toHaveCount(2);
  await expect(riskItems).toHaveCount(0);
  await expect(page.getByText('没有符合当前筛选条件的风险条目。')).toBeVisible();

  // 叶名称搜索：「第二」→ 只剩第二叶
  await toolbar.getByRole('button', { name: '全部' }).first().click();
  await toolbar.getByLabel('按叶名称筛选').fill('第二');
  await expect(folioRows).toHaveCount(1);
  await expect(folioRows.first()).toContainText('卷一·第二叶');

  // 搜索一个不存在的叶名 → 两张清单都给出无结果状态与清除入口
  await toolbar.getByLabel('按叶名称筛选').fill('不存在的叶名');
  await expect(folioRows).toHaveCount(0);
  await expect(page.getByText('没有符合当前筛选条件的叶。')).toBeVisible();
  await expect(riskItems).toHaveCount(0);
  await page.getByRole('button', { name: '清除筛选' }).first().click();
  await expect(folioRows).toHaveCount(3);
  await expect(riskItems).toHaveCount(totalRisks);

  // 风险等级筛选：只看「提示」级（样例含 f3 的“方案未存版”和项目级“工序未登记用材”）
  await toolbar.getByRole('button', { name: '提示' }).click();
  const visibleRiskCount = await riskItems.count();
  expect(visibleRiskCount).toBe(2);
  for (const tag of await riskItems.locator('.tag').allInnerTexts()) {
    expect(tag).toBe('提示');
  }
  // 仅第三叶带叶级提示风险，故分叶表只剩第三叶
  await expect(folioRows).toHaveCount(1);
  await expect(folioRows.first()).toContainText('卷一·第三叶（虫蛀）');
  await toolbar.getByRole('button', { name: '全部等级' }).click();

  // 排序：按阶段降序 → 阶段最靠后的第三叶排第一
  await toolbar.getByLabel('排序字段').selectOption('stage');
  await toolbar.getByRole('button', { name: /降序|升序/ }).click(); // 默认升序 → 切到降序
  await expect(folioRows.first()).toContainText('卷一·第三叶（虫蛀）');
  await toolbar.getByLabel('排序字段').selectOption('default');

  // 保留“点击风险跳转对应叶”的能力：筛选「提示」后第一条绑定叶的风险点「前往该叶」
  await toolbar.getByRole('button', { name: '提示' }).click();
  await riskItems.first().getByRole('button', { name: '前往该叶' }).click();
  await expect(page.locator('.folio-strip')).toBeVisible();
});

test('进度看板：空项目给出空数据状态', async ({ page }) => {
  await page.getByRole('button', { name: '新建项目' }).first().click();
  await page.locator('#p-name').fill('空看板项目');
  await page.getByRole('button', { name: '创建' }).click();
  await page.getByRole('button', { name: '进度看板' }).click();
  await expect(page.getByRole('heading', { name: '项目进度与风险看板' })).toBeVisible();
  // 无扫描叶 → 漏斗为 0，分叶表与风险清单各自给出空状态
  await expect(page.locator('.folio-row')).toHaveCount(0);
  await expect(page.getByText('尚未导入扫描叶。')).toBeVisible();
  await expect(page.getByText('当前没有触发任何风险规则，继续保持留痕习惯。')).toBeVisible();
});

test('载入内置样例后可以浏览标注页', async ({ page }) => {
  await page.getByRole('button', { name: '载入样例' }).click();
  await expect(page.getByText('《稼轩长短句》样卷')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.folio-thumb')).toHaveCount(3);
  // 第三叶才有预置的虫孔/撕裂标注，切过去
  await page.locator('.folio-thumb').nth(2).click();
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.locator('.stats-card').getByText('虫蛀')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('.stats-card').getByText('撕裂')).toBeVisible();
});

test('切换视图：样本 → 推荐材料', async ({ page }) => {
  await page.getByRole('button', { name: '载入样例' }).click();
  await page.getByRole('button', { name: '纸墨样本' }).click();
  await expect(page.getByRole('heading', { name: '纸张与墨色样本库' })).toBeVisible();
  await page.getByRole('button', { name: '推荐材料' }).first().click();
  await expect(page.getByRole('heading', { name: '修补材料库与推荐' })).toBeVisible();
  await expect(page.locator('.rec-head').first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/Mock|近似|厚度/).first()).toBeVisible();
});

test('新建空项目并记录一道工序', async ({ page }) => {
  await page.getByRole('button', { name: '新建项目' }).first().click();
  await page.locator('#p-name').fill('Playwright 临时卷');
  await page.getByRole('button', { name: '创建' }).click();
  // 新建后自动选中，进入标注视图
  await expect(page.locator('.folio-strip')).toBeVisible({ timeout: 5_000 });

  await page.getByRole('button', { name: '修复工序' }).click();
  await page.getByRole('button', { name: '记一道工序' }).click();
  await page.getByPlaceholder('如：虫孔嵌补').fill('干揭分离');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('干揭分离')).toBeVisible();
});

test('批注：发表并标记解决', async ({ page }) => {
  await page.getByRole('button', { name: '载入样例' }).click();
  await page.getByRole('button', { name: '批注', exact: true }).click();
  await page.locator('.composer textarea').fill('此处建议改用净皮棉连');
  await page.getByRole('button', { name: /发表/ }).click();
  const row = page.locator('.c-list li').filter({ hasText: '此处建议改用净皮棉连' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '标记解决' }).click();
  await expect(row).toHaveClass(/resolved/);
});

test('修复档案：导出预览标风险、确认后导出、成功留痕', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '载入样例' }).click();
  await expect(page.getByText('《稼轩长短句》样卷')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '修复档案' }).click();
  await expect(page.getByRole('heading', { name: '修复档案导出' })).toBeVisible();

  // 进入导出预览：样例有未解决批注 → 风险区标出三类归档风险中的相关项
  await page.getByRole('button', { name: /导出预览/ }).click();
  const dialog = page.locator('.modal.preview');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /导出预览/ })).toBeVisible();
  // 汇总计数
  await expect(dialog.getByText('内容汇总')).toBeVisible();
  // 样例有未解决批注（unresolved-comments）与未人工存版（plan-not-versioned）→ 对应风险出现
  await expect(dialog.getByText('存在未解决批注')).toBeVisible();
  await expect(dialog.getByText('修补方案未保存版本')).toBeVisible();
  // 校验清单
  await expect(dialog.getByText('批注全部闭环')).toBeVisible();
  await expect(dialog.getByText('修复前后对比图')).toBeVisible();

  // 有风险时未勾选确认 → 导出按钮禁用
  const confirmBtn = dialog.getByRole('button', { name: /确认并生成/ });
  await expect(confirmBtn).toBeDisabled();
  await dialog.locator('.ack input').check();
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  // Mock 直接完成导出：预览关闭，成功面板与记录区显示文件名和校验摘要
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.done')).toContainText('index.html 可离线浏览');
  const records = page.locator('.records');
  await expect(records).toBeVisible();
  await expect(records.locator('li.success')).toHaveCount(1);
  await expect(records).toContainText('修复档案-mock-');
  await expect(records).toContainText('原图一致 3/3');
  await expect(records).toContainText('对照图 1');
});

test('修复档案：空项目预览给出阻断项，不能导出', async ({ page }) => {
  await page.getByRole('button', { name: '新建项目' }).first().click();
  await page.locator('#p-name').fill('无叶档案项目');
  await page.getByRole('button', { name: '创建' }).click();
  await page.getByRole('button', { name: '修复档案' }).click();
  await page.getByRole('button', { name: /导出预览/ }).click();
  const dialog = page.locator('.modal.preview');
  await expect(dialog).toBeVisible();
  // 无扫描叶 → 清单项为阻断，确认按钮禁用
  const confirmBtn = dialog.getByRole('button', { name: /确认并生成/ });
  await expect(confirmBtn).toBeDisabled();
  await expect(dialog.locator('.checklist li.fail').first()).toContainText('扫描叶');
});
