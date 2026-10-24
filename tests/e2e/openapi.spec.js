import { mkdir, readFile } from 'node:fs/promises';
import { test, expect } from '../helpers/admin-session.js';
import { healthResponseSchema, openApiDocument } from '../../src/modules/openapi/server.js';

test('administrator can read, try and download the health contract on desktop and mobile', async ({
  page,
  baseURL,
  adminCookie,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.context().addCookies([
    {
      name: 'starter_session',
      value: adminCookie,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/admin/api-docs');
  await expect(page.getByRole('heading', { name: '接口文档', exact: true })).toBeVisible();
  const reference = page.getByRole('region', { name: 'OpenAPI 接口文档' });
  await expect(
    reference.getByRole('heading', { name: '/health 检查应用存活', exact: true }),
  ).toBeVisible();
  await reference
    .getByRole('button', { name: 'GET /health 检查应用存活 Copy link', exact: true })
    .click();
  await expect(reference.getByText('无需登录，无请求参数。', { exact: false })).toBeVisible();
  const operationHeading = reference.getByRole('heading', {
    name: '/health 检查应用存活',
    exact: true,
  });
  const operationId = await operationHeading.evaluate((element) => element.closest('[id]')?.id);
  expect(operationId).toBeTruthy();
  await page.locator('#main-content').evaluate((element) => element.scrollTo({ top: 0 }));
  await page.evaluate((id) => {
    location.hash = encodeURIComponent(id);
  }, operationId);
  await expect(operationHeading).toBeInViewport({ ratio: 1 });

  await reference.getByRole('button', { name: 'Test Request (get /health)', exact: true }).click();
  const client = page.getByRole('dialog', { name: 'API Client', exact: true });
  await expect(client).toBeVisible();
  const pendingResponse = page.waitForResponse(`${baseURL}/health`);
  await client.getByRole('button', { name: /^Send get request to / }).click();
  const response = await pendingResponse;
  expect(response.status()).toBe(200);
  expect(response.request().method()).toBe('GET');
  healthResponseSchema.parse(await response.json());
  await expect(client.getByRole('link', { name: '200 OK', exact: true })).toBeVisible();
  await client.getByRole('button', { name: 'Close Client', exact: true }).click();

  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载 OpenAPI JSON' }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe('openapi.json');
  const document = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(document).toEqual(openApiDocument);

  await mkdir('.local/screenshots', { recursive: true });
  await page.screenshot({ path: '.local/screenshots/openapi-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    reference.getByRole('heading', { name: '/health 检查应用存活', exact: true }),
  ).toBeVisible();
  await operationHeading.scrollIntoViewIfNeeded();
  await expect(operationHeading).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/screenshots/openapi-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '打开导航菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '用户管理' }).click();
  await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
