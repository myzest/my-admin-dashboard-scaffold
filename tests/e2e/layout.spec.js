import { mkdir } from 'node:fs/promises';
import { test, expect } from '../helpers/admin-session.js';
import { site } from '../../src/config/site.js';

test.beforeAll(async () => {
  await mkdir('.local/screenshots', { recursive: true });
});

test.beforeEach(async ({ context, baseURL, page, adminCookie }) => {
  await context.addCookies([
    { name: 'starter_session', value: adminCookie, url: baseURL, httpOnly: true, sameSite: 'Lax' },
  ]);
  await page.route('**/api/admin/users?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    const pageNumber = Number(query.get('page'));
    const pageSize = Number(query.get('pageSize'));
    const search = query.get('search');
    const total = search === 'empty' ? 0 : search === 'single' ? 1 : 500;
    const items = Array.from({ length: Math.min(total, pageSize) }, (_, index) => ({
      id: 900000 + (pageNumber - 1) * pageSize + index,
      username: `layout_user_${index}`,
      displayName: '长显示名称用于验证完整内容查看和固定列'.repeat(2),
      isEnabled: true,
      balance: '9999999999999999.9999',
      createdAt: '2026-10-25T00:00:00.000Z',
    }));
    return route.fulfill({
      json: {
        status: true,
        data: { items, pagination: { page: pageNumber, pageSize, total } },
        error: {},
      },
    });
  });
});

async function expectNoPageOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(
    true,
  );
}

async function expectPaginationAtTableBottom(page) {
  await expect
    .poll(async () => {
      const frame = await page.locator('[data-adaptive-table]').boundingBox();
      const pagination = await page.locator('.arco-pagination').boundingBox();
      return Math.abs(frame.y + frame.height - pagination.y - pagination.height);
    })
    .toBeLessThan(2);
}

test('table fills the viewport and keeps its header, scrollbar and pagination accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/admin/users');
  const frame = page.locator('[data-adaptive-table]');
  const body = frame.getByRole('region', { name: '表格内容' });
  const header = frame.locator('[data-table-header]');
  const pagination = page.locator('.arco-pagination');
  await page.getByLabel('下一页', { exact: true }).click();
  await expect(page.getByLabel('第 2 页', { exact: true })).toHaveAttribute('aria-current', 'true');
  await pagination.getByRole('combobox').click();
  await page.getByRole('option', { name: '50 条/页', exact: true }).click();
  await expect(page.getByLabel('第 1 页', { exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(body.getByRole('row')).toHaveCount(50);
  await expect(pagination).toBeInViewport({ ratio: 1 });
  await expectNoPageOverflow(page);
  await body
    .getByRole('button', { name: '长显示名称用于验证完整内容查看和固定列'.repeat(2), exact: true })
    .first()
    .click();
  const fullText = page.locator('.arco-popover-content');
  await expect(
    fullText.getByText('长显示名称用于验证完整内容查看和固定列'.repeat(2), { exact: true }),
  ).toBeVisible();
  await expect(fullText).toBeInViewport({ ratio: 1 });
  await page.getByRole('heading', { name: '用户管理', exact: true }).click();
  const headerBefore = await header.boundingBox();
  const footerBefore = await pagination.boundingBox();
  expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await body.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await body.evaluate((element) => element.scrollTo({ top: 500, left: 100 }));
  const scrollLeft = await body.evaluate((element) => element.scrollLeft);
  expect(scrollLeft).toBeGreaterThan(0);
  await expect.poll(() => header.evaluate((element) => element.scrollLeft)).toBe(scrollLeft);
  expect((await header.boundingBox()).y).toBeCloseTo(headerBefore.y, 0);
  expect((await pagination.boundingBox()).y).toBeCloseTo(footerBefore.y, 0);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled();
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(500);
  await page.getByLabel('下一页', { exact: true }).click();
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
  const heightBefore = (await frame.boundingBox()).height;
  for (const keyword of ['single', 'empty']) {
    await page.getByLabel('搜索用户名或显示名称').fill(keyword);
    await page.getByRole('button', { name: '查询', exact: true }).click();
    if (keyword === 'single') await expect(body.getByRole('row')).toHaveCount(1);
    else await expect(body.getByText('没有匹配的用户，请调整关键词。')).toBeVisible();
    await expect
      .poll(async () => Math.abs((await frame.boundingBox()).height - heightBefore))
      .toBeLessThan(2);
    await expectNoPageOverflow(page);
  }
  await page.getByLabel('搜索用户名或显示名称').fill('');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(body.getByRole('row')).toHaveCount(50);
  await page.screenshot({ path: '.local/screenshots/layout-desktop.png' });
  await page.setViewportSize({ width: 1024, height: 600 });
  await expect(pagination).toBeInViewport({ ratio: 1 });
  expect((await frame.boundingBox()).height).toBeLessThan(heightBefore);
  const heightWithoutError = (await body.boundingBox()).height;
  const failRequest = (route) =>
    route.fulfill({
      status: 503,
      json: {
        status: false,
        data: {},
        error: { code: 'TEMPORARY_ERROR', message: '布局验证：刷新暂不可用' },
      },
    });
  await page.route('**/api/admin/users?*', failRequest);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  const requestError = page.getByRole('alert').filter({ hasText: '布局验证：刷新暂不可用' });
  await expect(requestError).toBeVisible();
  await expect.poll(async () => (await body.boundingBox()).height).toBeLessThan(heightWithoutError);
  await expect(pagination).toBeInViewport({ ratio: 1 });
  await page.unroute('**/api/admin/users?*', failRequest);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(requestError).toBeHidden();
  await expect(pagination).toBeInViewport({ ratio: 1 });
  await expectNoPageOverflow(page);
});

test('mobile drawer, compact pagination and tablet collapse work without losing navigation state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/users');
  await expect(page).toHaveTitle(`用户管理 · ${site.name}`);
  await expect(page.getByRole('complementary', { name: '主导航' })).toBeHidden();
  await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(page.locator('.arco-pagination')).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel('搜索用户名或显示名称')).toBeHidden();
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await expect(page.getByLabel('搜索用户名或显示名称')).toBeVisible();
  await expect(page.locator('.arco-pagination')).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: '收起筛选', exact: true }).click();
  const menuButton = page.getByRole('button', { name: '打开导航菜单', exact: true });
  await menuButton.click();
  const navigation = page.getByRole('navigation', { name: '主导航' });
  await expect(navigation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(navigation).toBeHidden();
  await expect(menuButton).toBeFocused();
  await menuButton.click();
  await navigation.getByRole('menuitem', { name: '分类示例', exact: true }).click();
  await expect(page).toHaveTitle(`分类管理 · ${site.name}`);
  await expect(page.getByRole('heading', { name: '分类管理', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(navigation).toBeHidden();
  await page.goto('/admin/users');
  await page.screenshot({ path: '.local/screenshots/layout-mobile.png' });
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.locator('.arco-pagination')).toBeInViewport({ ratio: 1 });
  await expectNoPageOverflow(page);
  await page.setViewportSize({ width: 820, height: 820 });
  await page.getByRole('button', { name: '展开导航菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '分类示例', exact: true }).click();
  await expect(page.getByRole('button', { name: '收起导航菜单', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '收起导航菜单', exact: true }).click();
  await expect(page.getByRole('button', { name: '展开导航菜单', exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
});

test('short-screen modal keeps its actions visible while form content scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/admin/users');
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新增用户', exact: true });
  const submit = dialog.getByRole('button', { name: '创建用户', exact: true });
  await expect(submit).toBeInViewport({ ratio: 1 });
  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveCount(2);
  await expect(submit).toBeInViewport({ ratio: 1 });
  await dialog.getByLabel('用户名', { exact: true }).fill('a'.repeat(64));
  await dialog.getByLabel('显示名称', { exact: true }).fill('显示名称'.repeat(16));
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeInViewport({
    ratio: 1,
  });
  const bounds = await dialog.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(390);
  const submitBounds = await submit.boundingBox();
  expect(submitBounds.y + submitBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  expect(
    await dialog
      .locator('.arco-modal-content')
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await page.screenshot({ path: '.local/screenshots/layout-short-modal.png' });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
  const main = page.getByRole('main');
  expect(await main.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await main.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect(page.locator('.arco-pagination')).toBeInViewport({ ratio: 1 });
  await expectNoPageOverflow(page);
});

test('ordinary pages and sidebar scroll independently while guest forms remain reachable', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1024, height: 320 });
  await page.goto('/admin/profile');
  const main = page.getByRole('main');
  const sidebar = page.getByRole('complementary', { name: '主导航' });
  const sidebarBefore = await sidebar.boundingBox();
  await page.getByRole('button', { name: '修改密码', exact: true }).scrollIntoViewIfNeeded();
  expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await sidebar.boundingBox()).toEqual(sidebarBefore);
  expect((await page.getByRole('banner').boundingBox()).y).toBe(0);
  await sidebar.getByRole('menuitem', { name: '个人资料', exact: true }).scrollIntoViewIfNeeded();
  await expect(sidebar.getByRole('menuitem', { name: '个人资料', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expectNoPageOverflow(page);

  await context.clearCookies();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('**/api/auth/registration', (route) =>
    route.fulfill({
      json: { status: true, data: { allowRegistration: true }, error: {} },
    }),
  );
  for (const path of ['/login', '/register']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .getByRole('button', { name: path === '/login' ? '登录' : '创建账号', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('button', { name: path === '/login' ? '登录' : '创建账号', exact: true }),
    ).toBeInViewport({ ratio: 1 });
  }
});

test('the user logs menu item supports keyboard activation', async ({ page }) => {
  await page.goto('/admin/users');
  const row = page.getByRole('region', { name: '表格内容' }).getByRole('row').first();
  await row.getByRole('button', { name: '更多', exact: true }).click();
  const logs = page.getByRole('menuitem', { name: '日志', exact: true });
  await logs.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/admin/balance-logs?userId=900000');
});

test('short modal keeps select options reachable above the action footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await page.goto('/admin/users');
  const row = page.getByRole('region', { name: '表格内容' }).getByRole('row').first();
  await row.getByRole('button', { name: '调整余额', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '调整余额', exact: true });
  await dialog.getByRole('combobox').click();
  const decrease = page.getByRole('option', { name: '扣减', exact: true });
  await expect(decrease).toBeInViewport({ ratio: 1 });
  await decrease.click();
  await expect(dialog.getByRole('combobox')).toContainText('扣减');
  await expect(dialog.getByRole('button', { name: '确认调整', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
});

test('table popups close when their source rows scroll away', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 600 });
  await page.goto('/admin/users');
  const body = page.getByRole('region', { name: '表格内容' });
  const row = body.getByRole('row').first();
  await row
    .getByRole('button', { name: '长显示名称用于验证完整内容查看和固定列'.repeat(2), exact: true })
    .click();
  const popup = page.locator('.arco-popover-content');
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await row
    .getByRole('button', { name: '长显示名称用于验证完整内容查看和固定列'.repeat(2), exact: true })
    .click();
  await expect(popup).toBeVisible();
  await body.evaluate((element) => element.scrollTo({ top: 200 }));
  await expect(popup).toBeHidden();
  await body.evaluate((element) => element.scrollTo({ top: 0 }));
  await row.getByRole('button', { name: '更多', exact: true }).click();
  const logs = page.getByRole('menuitem', { name: '日志', exact: true });
  await expect(logs).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(logs).toBeHidden();
  await row.getByRole('button', { name: '更多', exact: true }).click();
  await expect(logs).toBeVisible();
  await body.evaluate((element) => element.scrollTo({ top: 200 }));
  await expect(logs).toBeHidden();
});

test.describe('mobile list filters', () => {
  test.use({ isMobile: true, hasTouch: true });

  const pages = [
    { path: 'users', input: '搜索用户名或显示名称', parameter: 'search' },
    { path: 'categories', input: '搜索分类名称', parameter: 'search' },
    { path: 'balance-logs', input: '按用户 ID 筛选', parameter: 'userId' },
    { path: 'operation-logs', input: '按对象 ID 筛选', parameter: 'targetId' },
  ];

  for (const { path, input, parameter } of pages) {
    test(`${path}: aligned filter control supports touch, query and clearing`, async ({ page }) => {
      await page.route(`**/api/admin/${path}?*`, (route) => {
        const query = new URL(route.request().url()).searchParams;
        const label = query.get(parameter) === '900001' ? '筛选命中结果' : '未筛选结果';
        return route.fulfill({
          json: {
            status: true,
            data: {
              items: [
                {
                  id: 900001,
                  username: label,
                  displayName: label,
                  name: label,
                  description: label,
                  operatorUsername: label,
                  isEnabled: true,
                  balance: '1.0000',
                  changeAmount: '1.0000',
                  balanceBefore: '0.0000',
                  balanceAfter: '1.0000',
                  reason: label,
                  action: 'USER_UPDATED',
                  targetType: 'user',
                  targetId: 900001,
                  changes: {},
                  createdAt: '2026-10-25T00:00:00.000Z',
                  updatedAt: '2026-10-25T00:00:00.000Z',
                },
              ],
              pagination: { page: 1, pageSize: 10, total: 1 },
            },
            error: {},
          },
        });
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/admin/${path}`);
      const toggle = page.getByRole('button', { name: /^(收起)?筛选(?:（\d+）)?$/ });
      const field = page.getByRole('textbox', { name: input, exact: true });
      const body = page.getByRole('region', { name: '表格内容' });
      await expect(body).toContainText('未筛选结果');

      for (const width of [320, 390, 767]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(toggle).toBeInViewport({ ratio: 1 });
        const alignment = await toggle.evaluate((button) => {
          const bounds = button.getBoundingClientRect();
          const icon = button.querySelector('svg').getBoundingClientRect();
          const text = document.createRange();
          text.selectNodeContents(button.querySelector('span'));
          const label = text.getBoundingClientRect();
          const center = bounds.y + bounds.height / 2;
          return {
            iconOffset: Math.abs(icon.y + icon.height / 2 - center),
            textOffset: Math.abs(label.y + label.height / 2 - center),
          };
        });
        expect(alignment.iconOffset).toBeLessThanOrEqual(2);
        expect(alignment.textOffset).toBeLessThanOrEqual(2);
        await expectNoPageOverflow(page);
      }

      await page.setViewportSize({ width: 768, height: 844 });
      await expect(toggle).toBeHidden();
      await expect(field).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(field).toBeHidden();
      await toggle.tap();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(field).toBeInViewport({ ratio: 1 });
      await field.fill('900001');
      await expect(body).toContainText('未筛选结果');
      if (path === 'operation-logs') {
        await page.getByRole('combobox', { name: '按操作动作筛选' }).tap();
        await page.getByRole('option', { name: '编辑用户', exact: true }).tap();
        await page.getByRole('combobox', { name: '按对象类型筛选' }).tap();
        await page.getByRole('option', { name: '用户', exact: true }).tap();
        await expect(page.getByRole('option', { name: '系统设置', exact: true })).toBeHidden();
      }
      const filterCount = path === 'operation-logs' ? 3 : 1;
      const request = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return (
          url.pathname === `/api/admin/${path}` && url.searchParams.get(parameter) === '900001'
        );
      });
      await page.getByRole('button', { name: '查询', exact: true }).tap();
      const query = new URL((await request).url()).searchParams;
      expect(query.get('page')).toBe('1');
      if (path === 'operation-logs') {
        expect(query.get('action')).toBe('USER_UPDATED');
        expect(query.get('targetType')).toBe('user');
      }
      await expect(body).toContainText('筛选命中结果');
      await expect(toggle).toHaveText(`收起筛选（${filterCount}）`);
      await expectPaginationAtTableBottom(page);
      await page.screenshot({ path: `.local/screenshots/filters-${path}-expanded.png` });
      await toggle.tap();
      await expect(field).toBeHidden();
      await expect(toggle).toHaveText(`筛选（${filterCount}）`);
      await expect(body).toContainText('筛选命中结果');
      await expectPaginationAtTableBottom(page);
      await page.screenshot({ path: `.local/screenshots/filters-${path}-collapsed.png` });
      await toggle.tap();
      await expect(field).toHaveValue('900001');
      if (path === 'operation-logs') {
        await page.getByRole('button', { name: '重置', exact: true }).tap();
      } else {
        await field.fill('');
        await page.getByRole('button', { name: '查询', exact: true }).tap();
      }
      await expect(body).toContainText('未筛选结果');
      await expect(field).toHaveValue('');
      await expect(toggle).toHaveText('收起筛选');
      await expectNoPageOverflow(page);
    });
  }
});
