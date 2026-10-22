import '../../scripts/load-env.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { sealData } from 'iron-session';
import { getDatabase } from '../../src/server/database.js';
import { getSessionModel } from '../../src/modules/auth/models.js';
import { getUserModel } from '../../src/modules/users/models.js';
import { healthResponseSchema, openApiDocument } from '../../src/modules/openapi/server.js';

test.afterAll(async () => {
  await getDatabase().close();
});

test('administrator can read, try and download the health contract on desktop and mobile', async ({
  page,
  baseURL,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const admin = await getUserModel().findOne({
    where: { username: process.env.ADMIN_USERNAME, role: 'admin' },
  });
  // This documentation test must not consume the login suite's shared IP quota.
  const session = await getSessionModel().create({
    id: randomUUID(),
    userId: admin.id,
    expiresAt: new Date(Date.now() + 3600000),
  });
  try {
    await page.context().addCookies([
      {
        name: 'starter_session',
        value: await sealData(
          { sessionId: session.id },
          { password: process.env.SESSION_SECRET, ttl: 3600 },
        ),
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

    await reference
      .getByRole('button', { name: 'Test Request (get /health)', exact: true })
      .click();
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.local/screenshots/openapi-mobile.png', fullPage: true });
    await page.getByRole('menuitem', { name: '用户管理' }).click();
    await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await session.destroy();
  }
});
