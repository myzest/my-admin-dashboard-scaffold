import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { site } from '../../src/config/site.js';

test('admin and ordinary users complete registration, balance and account flows', async ({
  page,
  browser,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const username = `u${suffix.slice(0, 4)}`;
  const registeredUsername = `registered_${suffix}`;
  const password = `Browser-${randomUUID()}`;
  let accountPassword = password;
  const reason = `人工调整 ${suffix}`;
  const ids = new Set();
  const errors = [];
  let previousRegistration;
  let memberContext;
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('.local/screenshots', { recursive: true });

  async function login(target, account, accountPassword) {
    await target.goto('/login');
    await target.getByLabel('账号', { exact: true }).fill(account);
    await target.getByLabel('密码', { exact: true }).fill(accountPassword);
    await target.getByRole('button', { name: '登录', exact: true }).click();
  }

  try {
    await login(page, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/users$/);
    await expect(page).toHaveTitle(`用户管理 · ${site.name}`);
    await expect(page.getByRole('complementary', { name: '主导航' })).toContainText(site.name);
    const settingResponse = await page.request.get('/api/settings/registration');
    expect(settingResponse.status()).toBe(200);
    previousRegistration = (await settingResponse.json()).data.allowRegistration;
    expect(typeof previousRegistration).toBe('boolean');
    const closed = await page.request.put('/api/settings/registration', {
      data: { allowRegistration: false },
    });
    expect(closed.status()).toBe(200);

    await page.getByRole('button', { name: '新增用户', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('用户名', { exact: true }).fill(username);
    await dialog.getByLabel('显示名称', { exact: true }).fill('浏览器测试用户');
    await dialog.getByLabel('密码', { exact: true }).fill(password);
    const createResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/users') && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: '创建用户', exact: true }).click();
    const created = await createResponse;
    expect(created.status()).toBe(201);
    const userId = (await created.json()).data.id;
    ids.add(userId);
    await expect(dialog).toBeHidden();
    const row = page.getByRole('row').filter({ hasText: username });
    await expect(row).toContainText('0.0000');
    await expect(row).toContainText('已启用');

    await row.getByRole('button', { name: '调整余额', exact: true }).click();
    await dialog.getByLabel('金额', { exact: true }).fill('1.23456');
    await dialog.getByLabel('原因', { exact: true }).fill(reason);
    await dialog.getByRole('button', { name: '确认调整', exact: true }).click();
    await expect(
      dialog.getByText('金额最多支持 16 位整数和 4 位小数', { exact: true }),
    ).toBeVisible();
    await dialog.getByLabel('金额', { exact: true }).fill('1.2345');
    const balanceRoute = `**/api/users/${userId}/balance`;
    const balanceRequests = [];
    let firstBalanceStatus;
    await page.route(balanceRoute, async (route) => {
      balanceRequests.push(route.request().postDataJSON());
      if (balanceRequests.length === 1) {
        const response = await route.fetch();
        firstBalanceStatus = response.status();
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    await page.evaluate(() => {
      window.originalStorageSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === sessionStorage && key.startsWith('pending-balance-adjustment:')) {
          throw new DOMException('Storage is full', 'QuotaExceededError');
        }
        return window.originalStorageSetItem.call(this, key, value);
      };
    });
    await dialog.getByRole('button', { name: '确认调整', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('调整尚未发送');
    expect(balanceRequests).toHaveLength(0);
    await expect(dialog.getByLabel('金额', { exact: true })).toBeEnabled();
    await page.evaluate(() => {
      Storage.prototype.setItem = window.originalStorageSetItem;
      delete window.originalStorageSetItem;
    });
    await dialog.getByRole('button', { name: '确认调整', exact: true }).click();
    const retryAdjustment = dialog.getByRole('button', { name: '重试本次调整', exact: true });
    await expect(retryAdjustment).toBeEnabled();
    await expect(dialog.getByLabel('金额', { exact: true })).toBeDisabled();
    await expect.poll(() => firstBalanceStatus).toBe(200);
    await expect(dialog.getByRole('alert').filter({ hasText: '网络连接失败' })).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await row.getByRole('button', { name: '调整余额', exact: true }).click();
    await expect(retryAdjustment).toBeEnabled();
    await expect(dialog.getByLabel('金额', { exact: true })).toHaveValue('1.2345');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await page.reload();
    await row.getByRole('button', { name: '调整余额', exact: true }).click();
    await expect(retryAdjustment).toBeEnabled();
    await expect(dialog.getByLabel('金额', { exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('原因', { exact: true })).toHaveValue(reason);
    await page.evaluate(() => {
      window.originalStorageRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        if (this === sessionStorage && key.startsWith('pending-balance-adjustment:')) {
          throw new DOMException('Storage access denied', 'SecurityError');
        }
        return window.originalStorageRemoveItem.call(this, key);
      };
    });
    await retryAdjustment.click();
    await expect(dialog.getByRole('alert').filter({ hasText: '无法清除本次调整' })).toBeVisible();
    await expect(dialog.getByLabel('金额', { exact: true })).toBeDisabled();
    await page.evaluate(() => {
      Storage.prototype.removeItem = window.originalStorageRemoveItem;
      delete window.originalStorageRemoveItem;
    });
    await retryAdjustment.click();
    await expect(dialog).toBeHidden();
    await page.unroute(balanceRoute);
    expect(balanceRequests).toHaveLength(3);
    expect(balanceRequests[1]).toEqual(balanceRequests[0]);
    expect(balanceRequests[2]).toEqual(balanceRequests[0]);
    const storedLogs = await page.request.get(`/api/balance-logs?userId=${userId}`);
    expect((await storedLogs.json()).data.pagination.total).toBe(1);
    await expect(row).toContainText('1.2345');
    await page.screenshot({ path: '.local/screenshots/users.png', fullPage: true });

    await row.getByRole('link', { name: '日志', exact: true }).click();
    await expect(page.getByRole('heading', { name: '余额日志', exact: true })).toBeVisible();
    const logRow = page.getByRole('row').filter({ hasText: reason });
    await expect(logRow).toContainText(username);
    await expect(logRow).toContainText('1.2345');
    await expect(logRow).toContainText(process.env.ADMIN_USERNAME);
    await page.screenshot({ path: '.local/screenshots/balance-logs.png', fullPage: true });

    memberContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      viewport: { width: 1440, height: 960 },
    });
    const memberPage = await memberContext.newPage();
    memberPage.on('pageerror', (error) => errors.push(error.message));
    await memberPage.goto('/register');
    await expect(memberPage.getByText('当前未开放注册，请联系管理员创建账号。')).toBeVisible();
    await expect(memberPage.getByRole('button', { name: '创建账号', exact: true })).toHaveCount(0);

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: '系统设置', exact: true })).toBeVisible();
    const registrationSwitch = page.getByRole('switch', { name: '允许自行注册' });
    await expect(registrationSwitch).toHaveAttribute('aria-checked', 'false');
    await registrationSwitch.click();
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/settings/registration') &&
        response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    expect((await saveResponse).status()).toBe(200);
    await page.screenshot({ path: '.local/screenshots/settings.png', fullPage: true });

    await memberPage.reload();
    await memberPage.getByLabel('用户名', { exact: true }).fill(registeredUsername);
    await memberPage.getByLabel('显示名称', { exact: true }).fill('自行注册用户');
    await memberPage.getByLabel('密码', { exact: true }).fill(password);
    await memberPage.screenshot({ path: '.local/screenshots/registration.png', fullPage: true });
    const registerResponse = memberPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/auth/register') && response.request().method() === 'POST',
    );
    await memberPage.getByRole('button', { name: '创建账号', exact: true }).click();
    const registered = await registerResponse;
    expect(registered.status()).toBe(201);
    ids.add((await registered.json()).data.user.id);
    await expect(memberPage).toHaveURL(/\/login\?registered=1$/);

    await login(memberPage, username, password);
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    await expect(memberPage.getByText('1.2345', { exact: true })).toBeVisible();
    await expect(memberPage.getByRole('menuitem', { name: '工作台', exact: true })).toBeVisible();
    for (const name of ['用户管理', '分类示例', '系统设置']) {
      await expect(memberPage.getByRole('menuitem', { name, exact: true })).toHaveCount(0);
    }
    expect(
      (
        await page.request.post(`/api/users/${userId}/balance`, {
          data: {
            direction: 'increase',
            amount: '0.0001',
            reason: '验证工作台刷新',
            operationId: randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    await memberPage.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(memberPage.getByText('1.2346', { exact: true })).toBeVisible();
    await memberPage.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 503,
        json: {
          status: false,
          data: {},
          error: { code: 'SERVICE_UNAVAILABLE', message: '刷新暂不可用' },
        },
      }),
    );
    await memberPage.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(memberPage.getByRole('alert').filter({ hasText: '刷新暂不可用' })).toBeVisible();
    await expect(memberPage.getByText('1.2346', { exact: true })).toBeVisible();
    await memberPage.unroute('**/api/auth/me');
    expect(
      (
        await page.request.post(`/api/users/${userId}/balance`, {
          data: {
            direction: 'decrease',
            amount: '0.0001',
            reason: '还原工作台刷新余额',
            operationId: randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    await memberPage.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(memberPage.getByText('1.2345', { exact: true })).toBeVisible();
    await memberPage.screenshot({ path: '.local/screenshots/user-dashboard.png', fullPage: true });
    await memberPage.setViewportSize({ width: 390, height: 844 });
    expect(
      await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await memberPage.screenshot({
      path: '.local/screenshots/user-dashboard-mobile.png',
      fullPage: true,
    });
    await memberPage.setViewportSize({ width: 1440, height: 960 });
    await memberPage.goto('/users');
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    await memberPage.goto('/balance-logs');
    await expect(memberPage.getByRole('row').filter({ hasText: reason })).toContainText('1.2345');
    await expect(memberPage.getByLabel('按用户 ID 筛选')).toHaveCount(0);
    expect((await memberPage.request.get('/api/users')).status()).toBe(403);

    await page.goto('/users');
    await row.getByRole('button', { name: '停用', exact: true }).click();
    await expect(dialog).toContainText('账号、余额和日志仍会保留');
    await dialog.getByRole('button', { name: '确认停用', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText('已停用');
    await expect(row).toContainText('1.2345');
    await memberPage.goto('/dashboard');
    await expect(memberPage).toHaveURL(/\/login$/);
    await row.getByRole('button', { name: '启用', exact: true }).click();
    await dialog.getByRole('button', { name: '确认启用', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText('已启用');
    expect((await memberPage.request.get('/api/auth/me')).status()).toBe(401);
    await login(memberPage, username, accountPassword);
    await expect(memberPage).toHaveURL(/\/dashboard$/);

    await row.getByRole('button', { name: '重置密码', exact: true }).click();
    await expect(dialog).toContainText('所有设备上的登录会话都会失效');
    await dialog.getByLabel('新密码', { exact: true }).fill('short');
    await dialog.getByRole('button', { name: '确认重置', exact: true }).click();
    await expect(dialog.getByText('密码至少 6 位', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.local/screenshots/reset-password-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 960 });
    accountPassword = '123456';
    await dialog.getByLabel('新密码', { exact: true }).fill(accountPassword);
    await dialog.getByRole('button', { name: '确认重置', exact: true }).click();
    await expect(dialog).toBeHidden();
    await memberPage.goto('/dashboard');
    await expect(memberPage).toHaveURL(/\/login$/);
    await login(memberPage, username, accountPassword);
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    await expect(memberPage.getByText('1.2345', { exact: true })).toBeVisible();

    const newPassword = `Changed-${randomUUID()}`;
    await memberPage.goto('/profile');
    const passwordRegion = memberPage.getByRole('region', { name: '修改密码', exact: true });
    await passwordRegion.getByLabel('当前密码', { exact: true }).fill('incorrect-password');
    await passwordRegion.getByLabel('新密码', { exact: true }).fill(newPassword);
    await passwordRegion.getByRole('button', { name: '修改密码', exact: true }).click();
    await expect(passwordRegion.getByRole('alert')).toContainText('原密码不正确');
    await expect(memberPage).toHaveURL(/\/profile$/);
    await passwordRegion.getByLabel('当前密码', { exact: true }).fill(accountPassword);
    await passwordRegion.getByRole('button', { name: '修改密码', exact: true }).click();
    await expect(memberPage).toHaveURL(/\/login\?passwordChanged=1$/);
    await login(memberPage, username, newPassword);
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    await expect(memberPage.getByText('1.2345', { exact: true })).toBeVisible();

    await page.goto('/users');
    await row.getByRole('button', { name: '删除', exact: true }).click();
    await expect(dialog).toContainText('1.2345');
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);
    ids.delete(userId);
    expect((await memberPage.request.get('/api/auth/me')).status()).toBe(401);
    await memberPage.goto('/dashboard');
    await expect(memberPage).toHaveURL(/\/login$/);

    await login(memberPage, registeredUsername, password);
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    await expect(memberPage.getByText('0.0000', { exact: true })).toBeVisible();
    await memberPage.getByRole('button', { name: '退出', exact: true }).click();
    await expect(memberPage).toHaveURL(/\/login$/);
    expect(errors).toEqual([]);
  } finally {
    try {
      if (typeof previousRegistration === 'boolean') {
        const restored = await page.request.put('/api/settings/registration', {
          data: { allowRegistration: previousRegistration },
        });
        expect(restored.status()).toBe(200);
      }
      for (const id of ids) {
        const removed = await page.request.delete(`/api/users/${id}`, { data: {} });
        expect([200, 404]).toContain(removed.status());
      }
      await page.request.post('/api/auth/logout', { data: {} });
    } finally {
      await memberContext?.close();
    }
  }
});
