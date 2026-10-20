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
    await expect(page).toHaveURL(/\/users$/);

    const settings = await page.request.get('/api/settings/registration');
    expect(settings.status()).toBe(200);
    previousRegistration = (await settings.json()).data.allowRegistration;
    expect(
      (
        await page.request.put('/api/settings/registration', { data: { allowRegistration: true } })
      ).status(),
    ).toBe(200);
    const created = await page.request.post('/api/users', { data: { username, password } });
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
      guestPage.getByRole('region', { name: '创建账号', exact: true }).getByRole('alert'),
    ).toContainText('用户名已存在');
    // Allow the failure handler's settings refresh to settle before checking retained form values.
    await guestPage.waitForLoadState('networkidle');
    await expect(guestPage.getByLabel('用户名', { exact: true })).toHaveValue(username);
    await expect(guestPage.getByLabel('显示名称', { exact: true })).toHaveValue('保留填写的名称');
    await expect(guestPage.getByLabel('密码', { exact: true })).toHaveValue(password);

    expect(
      (
        await page.request.put('/api/settings/registration', { data: { allowRegistration: false } })
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
            await page.request.put('/api/settings/registration', {
              data: { allowRegistration: previousRegistration },
            })
          ).status(),
        ).toBe(200);
      }
      if (userId) {
        expect((await page.request.delete(`/api/users/${userId}`, { data: {} })).status()).toBe(
          200,
        );
      }
      await page.request.post('/api/auth/logout', { data: {} });
    } finally {
      await guestContext?.close();
    }
  }
});
