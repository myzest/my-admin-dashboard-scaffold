import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { expectListRefreshRecovery } from '../helpers/refresh.js';

test('administrator completes CRUD, error recovery, pagination and logout', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const ids = new Set();
  const name = `产品动态-${randomUUID().slice(0, 6)}`;
  await mkdir('.local/screenshots', { recursive: true });

  async function findCreatedCategory(categoryName) {
    const response = await page.request.get(
      `/api/admin/categories?search=${encodeURIComponent(categoryName)}`,
    );
    const { data } = await response.json();
    const item = data.items.find((category) => category.name === categoryName);
    if (item) ids.add(item.id);
    return item;
  }

  try {
    await page.goto('/admin/categories');
    await expect(page).toHaveURL('/login');
    await page.screenshot({ path: '.local/screenshots/login.png', fullPage: true });
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByText('请输入账号', { exact: true })).toBeVisible();
    await page.getByLabel('账号', { exact: true }).fill(process.env.ADMIN_USERNAME);
    await page.getByLabel('密码', { exact: true }).fill('incorrect-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('region', { name: '登录工作台' }).getByRole('alert')).toContainText(
      '用户名或密码错误',
    );
    await page.getByLabel('密码', { exact: true }).fill(process.env.ADMIN_PASSWORD);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL('/admin/users');
    await page.goto('/admin/categories');

    await page.getByRole('button', { name: '新增分类' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('分类名称', { exact: true }).fill(name);
    await dialog.getByLabel('说明', { exact: true }).fill('发布产品更新与使用说明。');
    await dialog.getByRole('button', { name: '创建分类' }).click();
    await expect(dialog).toBeHidden();
    let row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    const createdCategory = await findCreatedCategory(name);
    expect(createdCategory).toBeDefined();

    await page.getByRole('button', { name: '新增分类' }).click();
    await dialog.getByLabel('分类名称', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: '创建分类' }).click();
    await expect(dialog.locator('.arco-alert')).toContainText('名称已存在');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();

    await row.getByRole('button', { name: '编辑' }).click();
    await dialog.getByLabel('说明', { exact: true }).fill('已更新的分类说明。');
    await dialog.getByRole('switch').click();
    await dialog.getByRole('button', { name: '保存修改' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText('已停用');

    await page.getByLabel('搜索分类名称').fill('没有这个分类');
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await expect(page.getByText('没有匹配的分类，请调整关键词。')).toBeVisible();
    await page.getByLabel('搜索分类名称').fill('');
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await expect(row).toBeVisible();

    for (let index = 0; index < 10; index++) {
      const response = await page.request.post('/api/admin/categories', {
        data: { name: `服务公告-${name}-${index}`, description: '分类分页验证' },
      });
      expect(response.status()).toBe(201);
      ids.add((await response.json()).data.id);
    }
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.getByLabel('下一页', { exact: true }).click();
    row = page.getByRole('row').filter({ hasText: name }).filter({ hasText: '已更新的分类说明。' });
    await expect(row).toBeVisible();
    await expect(page.getByLabel('第 2 页', { exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expectListRefreshRecovery(page, '**/api/admin/categories?*', row);
    await page.screenshot({ path: '.local/screenshots/categories.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: '分类管理' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.local/screenshots/mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 960 });

    await row.getByRole('button', { name: '删除', exact: true }).click();
    await dialog.getByRole('button', { name: '确认删除' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('分类已删除', { exact: true })).toBeVisible();
    await expect(page.getByLabel('第 1 页', { exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await page.goto('/admin/operation-logs');
    await expect(page.getByRole('heading', { name: '操作日志', exact: true })).toBeVisible();
    const logsRegion = page.getByRole('region', { name: '操作日志列表' });
    await logsRegion.getByRole('combobox', { name: '按对象类型筛选' }).click();
    await page.getByRole('option', { name: '分类', exact: true }).click();
    await logsRegion.getByLabel('按对象 ID 筛选').fill(String(createdCategory.id));
    await logsRegion.getByRole('button', { name: '查询', exact: true }).click();
    const categoryLogs = logsRegion
      .getByRole('row')
      .filter({ hasText: `分类 #${createdCategory.id}` });
    await expect(categoryLogs).toHaveCount(3);
    const createdLog = categoryLogs.filter({ hasText: '创建分类' });
    await expect(createdLog).toContainText(process.env.ADMIN_USERNAME);
    await expect(createdLog).toContainText(`分类名称：— → ${name}`);
    const updatedLog = categoryLogs.filter({ hasText: '编辑分类' });
    await expect(updatedLog).toContainText(
      '分类说明：发布产品更新与使用说明。 → 已更新的分类说明。',
    );
    await expect(updatedLog).toContainText('启用状态：是 → 否');
    await expect(categoryLogs.filter({ hasText: '删除分类' })).toContainText(
      `分类名称：${name} → —`,
    );
    await page.screenshot({ path: '.local/screenshots/operation-logs.png', fullPage: true });

    await logsRegion.getByRole('combobox', { name: '按操作动作筛选' }).click();
    await page.getByRole('option', { name: '编辑分类', exact: true }).click();
    await logsRegion.getByRole('button', { name: '查询', exact: true }).click();
    await expect(categoryLogs).toHaveCount(1);
    await expect(updatedLog).toBeVisible();

    await logsRegion.getByLabel('按对象 ID 筛选').fill('2147483647');
    await logsRegion.getByRole('button', { name: '查询', exact: true }).click();
    await expect(logsRegion.getByText('没有符合条件的操作日志。')).toBeVisible();
    await logsRegion.getByLabel('按对象 ID 筛选').fill(String(createdCategory.id));
    await logsRegion.getByRole('button', { name: '查询', exact: true }).click();
    await expect(updatedLog).toBeVisible();

    await page.route('**/api/admin/operation-logs?*', (route) =>
      route.fulfill({
        status: 503,
        json: {
          status: false,
          data: {},
          error: { code: 'TEMPORARY_ERROR', message: '服务暂时不可用，请稍后重试' },
        },
      }),
    );
    await logsRegion.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(logsRegion.locator('.arco-alert')).toContainText('服务暂时不可用');
    await expect(updatedLog).toBeVisible();
    await page.unroute('**/api/admin/operation-logs?*');
    await logsRegion.getByRole('button', { name: '重试', exact: true }).click();
    await expect(logsRegion.locator('.arco-alert')).toBeHidden();
    await expect(updatedLog).toBeVisible();
    await logsRegion.getByRole('button', { name: '重置', exact: true }).click();
    await expect(logsRegion.getByLabel('按对象 ID 筛选')).toHaveValue('');

    for (const id of ids) {
      const response = await page.request.delete(`/api/admin/categories/${id}`, { data: {} });
      expect([200, 404]).toContain(response.status());
    }
    ids.clear();
    await page.getByRole('button', { name: '退出', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await page.goto('/admin/categories');
    await expect(page).toHaveURL('/login');
    expect(errors).toEqual([]);
  } finally {
    for (const id of ids) {
      await page.request.delete(`/api/admin/categories/${id}`, { data: {} });
    }
    await page.request.post('/api/auth/logout', { data: {} });
  }
});
