import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

// 前后对比「局部细看」：同步缩放、拖动平移、一键复位、模式切换保留观察位置
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

async function loadSampleAndGotoCompare(page: Page) {
  await page.getByRole('button', { name: '载入样例' }).click();
  await expect(page.getByText('《稼轩长短句》样卷')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '前后对比' }).click();
  await expect(page.locator('.stage')).toBeVisible();
  // 等图像完成加载（imgbox 获得自然尺寸 900px）
  await expect(page.locator('.pane.before .imgbox')).toHaveCSS('width', '900px');
  await expect(page.locator('.pane.after .imgbox')).toHaveCSS('width', '900px');
}

test('前后对比：缩放、平移、复位，前后两图同步', async ({ page }) => {
  await loadSampleAndGotoCompare(page);
  await expect(page.locator('.zoombar .pct')).toHaveText('100%');

  // 按钮放大 → 125%
  await page.getByRole('button', { name: '放大' }).click();
  await expect(page.locator('.zoombar .pct')).toHaveText('125%');

  // 滚轮缩放（指针悬停在图上）
  const beforePane = page.locator('.pane.before');
  const box = (await beforePane.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await expect(page.locator('.zoombar .pct')).toHaveText('144%');

  // 复位 → 回到适配视图
  await page.getByRole('button', { name: '复位' }).click();
  await expect(page.locator('.zoombar .pct')).toHaveText('100%');

  // 拖动平移：imgbox 的 transform 随拖动变化
  const imgbox = page.locator('.pane.before .imgbox');
  const t0 = await imgbox.evaluate((el) => (el as HTMLElement).style.transform);
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 250, { steps: 5 });
  await page.mouse.up();
  const t1 = await imgbox.evaluate((el) => (el as HTMLElement).style.transform);
  expect(t1).not.toBe(t0);

  // 同步：前后两图同尺寸、pane 同尺寸 → transform 完全一致
  const tAfter = await page.locator('.pane.after .imgbox').evaluate((el) => (el as HTMLElement).style.transform);
  expect(tAfter).toBe(t1);
});

test('前后对比：横向滚动不误触发缩放', async ({ page }) => {
  await loadSampleAndGotoCompare(page);
  await expect(page.locator('.zoombar .pct')).toHaveText('100%');
  const box = (await page.locator('.pane.before').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // 触控板横向滚动：纯横向 / 横向为主 → 缩放比例不变
  await page.mouse.wheel(120, 0);
  await page.mouse.wheel(100, 20);
  await page.mouse.wheel(-90, 10);
  await expect(page.locator('.zoombar .pct')).toHaveText('100%');
  // 纵向滚动仍然缩放
  await page.mouse.wheel(0, -120);
  await expect(page.locator('.zoombar .pct')).toHaveText('115%');
});

test('前后对比：切换模式保留观察位置', async ({ page }) => {
  await loadSampleAndGotoCompare(page);
  await page.getByRole('button', { name: '放大' }).click();
  await page.getByRole('button', { name: '放大' }).click();
  await expect(page.locator('.zoombar .pct')).toHaveText('156%');

  // 并排 → 滑动叠加：缩放比例与观察位置保留
  await page.getByRole('button', { name: '滑动叠加' }).click();
  await expect(page.locator('.zoombar .pct')).toHaveText('156%');
  await expect(page.locator('.slider')).toBeVisible();
  // 滑动叠加 → 并排：同样保留
  await page.getByRole('button', { name: '并排' }).click();
  await expect(page.locator('.zoombar .pct')).toHaveText('156%');
});

test('前后对比：切换叶次恢复适配视图', async ({ page }) => {
  await loadSampleAndGotoCompare(page);
  // 给第二叶登记修复后图（直接改 mock 库，模拟已在标注页设置过）
  await page.evaluate(() => {
    const key = 'guji-mock-db-v1';
    const db = JSON.parse(localStorage.getItem(key)!);
    const f2 = db.folios.find((f: { name: string }) => f.name.includes('第二叶'));
    f2.after_rel = 'after/sample-3.png'; // 映射到存在的样例修复后图
    f2.after_checksum = 'mock-after-2';
    localStorage.setItem(key, JSON.stringify(db));
  });
  await page.reload();
  await page.getByRole('button', { name: '前后对比' }).click();
  await expect(page.locator('.stage')).toBeVisible();

  const select = page.locator('select.folio-select');
  await expect(select.locator('option')).toHaveCount(2);

  // 放大后切换叶次 → 恢复 100% 适配视图
  await page.getByRole('button', { name: '放大' }).click();
  await expect(page.locator('.zoombar .pct')).toHaveText('125%');
  const options = select.locator('option');
  const current = await select.inputValue();
  const other = (await options.nth(0).getAttribute('value')) === current ? 1 : 0;
  await select.selectOption({ index: other });
  await expect(page.locator('.zoombar .pct')).toHaveText('100%');
});

test('前后对比：没有修复后图时保留明确提示', async ({ page }) => {
  // 空项目：整体提示
  await page.getByRole('button', { name: '新建项目' }).first().click();
  await page.locator('#p-name').fill('无图测试卷');
  await page.getByRole('button', { name: '创建' }).click();
  await page.getByRole('button', { name: '前后对比' }).click();
  await expect(page.getByText('还没有任何叶次上传修复后图像')).toBeVisible();
  await expect(page.getByRole('button', { name: '放大' })).toBeDisabled();

  // 导入一张扫描但未设修复后图：当前叶提示
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '导入扫描' }).click()
  ]);
  await chooser.setFiles(path.resolve('public/samples/sample-1.png'));
  // 等导入完成（侧边栏出现新叶）
  await expect(page.getByText('sample-1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '前后对比' }).click();
  await expect(page.getByText('尚无修复后图像')).toBeVisible();
});
