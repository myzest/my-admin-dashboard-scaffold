import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/registration', (route) =>
    route.fulfill({ json: { status: true, data: { allowRegistration: true }, error: {} } }),
  );
});

test('server field errors stay with registered fields, preserve input and clear on edit', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/auth/register', (route) => {
    attempts += 1;
    return route.fulfill({
      status: 409,
      json: {
        status: false,
        data: {},
        error: {
          code: 'USERNAME_EXISTS',
          message: '用户名已存在',
          fields:
            attempts === 1
              ? { username: '用户名已存在', unregisteredField: '不应注入未知字段' }
              : { unregisteredField: '不应注入未知字段' },
        },
      },
    });
  });
  await page.goto('/register');
  const values = { 用户名: 'existing_user', 显示名称: '保留我的输入', 密码: '123456' };
  for (const [label, value] of Object.entries(values)) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  const usernameItem = page.locator('.arco-form-item').filter({
    has: page.getByLabel('用户名', { exact: true }),
  });
  const form = page.locator('#register-form');
  const submit = page.getByRole('button', { name: '创建账号', exact: true });
  await submit.click();
  await expect(usernameItem.getByRole('alert')).toHaveText('用户名已存在');
  await expect(page.locator('.arco-alert')).toContainText('用户名已存在');
  for (const [label, value] of Object.entries(values)) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  }
  await expect(page.getByText('不应注入未知字段', { exact: true })).toHaveCount(0);

  await page.getByLabel('用户名', { exact: true }).fill('another_user');
  await expect(usernameItem.getByRole('alert')).toHaveCount(0);
  await submit.click();
  await expect.poll(() => attempts).toBe(2);
  await expect(submit).toBeEnabled();
  await expect(page.locator('.arco-alert')).toContainText('用户名已存在');
  await expect(form.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('用户名', { exact: true })).toHaveValue('another_user');
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue(values.密码);
});

test('empty and overlong UTF-8 passwords fail locally before registration requests', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/auth/register', (route) => {
    attempts += 1;
    return route.fulfill({
      status: 400,
      json: { status: false, data: {}, error: { code: 'TEST_ONLY', message: '测试请求' } },
    });
  });
  await page.goto('/register');
  const submit = page.getByRole('button', { name: '创建账号', exact: true });
  await submit.click();
  await expect(page.locator('#register-form').getByRole('alert')).toHaveCount(2);
  expect(attempts).toBe(0);

  await page.getByLabel('用户名', { exact: true }).fill('valid_user');
  await page.getByLabel('密码', { exact: true }).fill('密'.repeat(25));
  await submit.click();
  await expect(page.locator('#register-form').getByRole('alert')).toHaveText(
    '密码不能超过 72 字节',
  );
  expect(attempts).toBe(0);

  await page.getByLabel('密码', { exact: true }).fill('密'.repeat(24));
  await submit.click();
  await expect.poll(() => attempts).toBe(1);
  await expect(page.locator('.arco-alert')).toContainText('测试请求');
});

test('legacy short usernames can reach login and failed credentials keep their actual message', async ({
  page,
}) => {
  let credentials;
  await page.route('**/api/auth/login', (route) => {
    credentials = route.request().postDataJSON();
    return route.fulfill({
      status: 401,
      json: {
        status: false,
        data: {},
        error: { code: 'INVALID_CREDENTIALS', message: '账号或密码不正确' },
      },
    });
  });
  await page.goto('/login');
  await page.getByLabel('账号', { exact: true }).fill('root');
  await page.getByLabel('密码', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.arco-alert')).toContainText('账号或密码不正确');
  expect(credentials).toEqual({ username: 'root', password: '123456' });
  await expect(page.getByText('登录已失效，正在返回登录页。', { exact: true })).toHaveCount(0);
});
