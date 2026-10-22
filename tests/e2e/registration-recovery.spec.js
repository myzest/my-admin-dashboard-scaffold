import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('a rejected registration keeps the entered account fields', async ({ page, browser }) => {
  const username = `duplicate_${randomUUID().slice(0, 8)}`;
  const password = `Registration-${randomUUID()}`;
  let previousRegistration;
  let userId;
  let guestContext;

  try {
    await page.goto('/login');
    await page.getByLabel('账号', { exact: true }).fill(process.env.ADMIN_USERNAME);
    await page.getByLabel('密码', { exact: true }).fill(process.env.ADMIN_PASSWORD);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL('/admin/users');

    const settings = await page.request.get('/api/admin/settings/registration');
    expect(settings.status()).toBe(200);
    previousRegistration = (await settings.json()).data.allowRegistration;
    expect(
      (
        await page.request.put('/api/admin/settings/registration', {
          data: { allowRegistration: true },
        })
      ).status(),
    ).toBe(200);
    const created = await page.request.post('/api/admin/users', { data: { username, password } });
    expect(created.status()).toBe(201);
    userId = (await created.json()).data.id;

    guestContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const guestPage = await guestContext.newPage();
    await guestPage.goto('/register');
    await guestPage.getByLabel('用户名', { exact: true }).fill(username);
    await guestPage.getByLabel('显示名称', { exact: true }).fill('保留填写的名称');
    await guestPage.getByLabel('密码', { exact: true }).fill(password);
    await guestPage.getByRole('button', { name: '创建账号', exact: true }).click();
    await expect(
      guestPage.getByRole('region', { name: '创建账号', exact: true }).locator('.arco-alert'),
    ).toContainText('用户名已存在');
    // Allow the failure handler's settings refresh to settle before checking retained form values.
    await guestPage.waitForLoadState('networkidle');
    await expect(guestPage.getByLabel('用户名', { exact: true })).toHaveValue(username);
    await expect(guestPage.getByLabel('显示名称', { exact: true })).toHaveValue('保留填写的名称');
    await expect(guestPage.getByLabel('密码', { exact: true })).toHaveValue(password);

    expect(
      (
        await page.request.put('/api/admin/settings/registration', {
          data: { allowRegistration: false },
        })
      ).status(),
    ).toBe(200);
    await guestPage.getByLabel('用户名', { exact: true }).fill(`${username}_closed`);
    await guestPage.getByRole('button', { name: '创建账号', exact: true }).click();
    await expect(guestPage.getByText('当前未开放注册，请联系管理员创建账号。')).toBeVisible();
    await expect(guestPage.getByRole('button', { name: '创建账号', exact: true })).toHaveCount(0);
  } finally {
    try {
      if (typeof previousRegistration === 'boolean') {
        expect(
          (
            await page.request.put('/api/admin/settings/registration', {
              data: { allowRegistration: previousRegistration },
            })
          ).status(),
        ).toBe(200);
      }
      if (userId) {
        expect(
          (await page.request.delete(`/api/admin/users/${userId}`, { data: {} })).status(),
        ).toBe(200);
      }
      await page.request.post('/api/auth/logout', { data: {} });
    } finally {
      await guestContext?.close();
    }
  }
});

test('a failed registration settings revalidation preserves entered fields', async ({ page }) => {
  let isFailing = false;
  await page.route('**/api/auth/registration', (route) =>
    route.fulfill({
      status: isFailing ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        isFailing
          ? {
              status: false,
              data: {},
              error: { code: 'TEST_FAILURE', message: '注册设置暂不可用' },
            }
          : { status: true, data: { allowRegistration: true }, error: {} },
      ),
    }),
  );
  await page.goto('/register');
  const alerts = page.getByRole('region', { name: '创建账号', exact: true }).getByRole('alert');
  const values = { 用户名: 'reviewuser', 显示名称: '保留注册资料', 密码: '123456' };
  for (const [label, value] of Object.entries(values)) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }

  async function expectEnteredFields() {
    for (const [label, value] of Object.entries(values)) {
      await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
    }
  }

  // Reconnect after SWR's default two-second request deduplication interval.
  await page.waitForTimeout(2300);
  isFailing = true;
  const failedResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/registration') && response.status() === 503,
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await failedResponse;
  await expect(alerts).toContainText('注册设置暂不可用');
  await expectEnteredFields();

  isFailing = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(alerts).toHaveCount(0);
  await expectEnteredFields();
});

test('login keeps the registration link and inputs across failed retries', async ({ page }) => {
  let isFailing = false;
  let allowRegistration = true;
  const pattern = '**/api/auth/registration';
  await page.route(pattern, (route) =>
    route.fulfill({
      status: isFailing ? 503 : 200,
      json: isFailing
        ? {
            status: false,
            data: {},
            error: { code: 'TEMPORARY_ERROR', message: '注册设置暂不可用' },
          }
        : { status: true, data: { allowRegistration }, error: {} },
    }),
  );
  await page.goto('/login');
  const registrationLink = page.getByRole('link', { name: '创建账号', exact: true });
  const error = page.getByRole('alert').filter({ hasText: '注册设置暂不可用' });
  await expect(registrationLink).toBeVisible();
  await page.getByLabel('账号', { exact: true }).fill('refresh_user');
  await page.getByLabel('密码', { exact: true }).fill('input-to-preserve');

  await page.waitForTimeout(2300);
  isFailing = true;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await expect(error).toBeVisible();
  await expect(registrationLink).toBeVisible();
  const failedRetry = page.waitForResponse(pattern);
  await error.getByRole('button', { name: '重试', exact: true }).click();
  expect((await failedRetry).status()).toBe(503);
  await expect(registrationLink).toBeVisible();

  isFailing = false;
  allowRegistration = false;
  await error.getByRole('button', { name: '重试', exact: true }).click();
  await expect(error).toBeHidden();
  await expect(registrationLink).toBeHidden();
  await expect(page.getByLabel('账号', { exact: true })).toHaveValue('refresh_user');
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('input-to-preserve');
});
