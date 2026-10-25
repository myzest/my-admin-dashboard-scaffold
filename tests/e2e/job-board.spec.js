import { mkdir } from 'node:fs/promises';
import { test, expect } from '../helpers/admin-session.js';

const BOARD_PATH = '/api/admin/bull-board';
const STATUS_PATTERN = '**/api/admin/bull-board/_status';
const FRAME_SELECTOR = 'iframe[title="Bull Board 后台任务面板"]';

test.beforeEach(async ({ page, baseURL, adminCookie }) => {
  await page.context().addCookies([
    {
      name: 'starter_session',
      value: adminCookie,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
});

async function openBoard(page) {
  await page.goto('/admin/jobs');
  await expect(page.getByRole('region', { name: '后台任务面板', exact: true })).toBeVisible();
  const board = page.frameLocator(FRAME_SELECTOR);
  await expect(board.getByRole('link', { name: 'background', exact: true }).first()).toBeVisible();
  return board;
}

async function getBackgroundQueue(page) {
  const response = await page.request.get(`${BOARD_PATH}/api/queues`);
  expect(response.status()).toBe(200);
  const { queues } = await response.json();
  const queue = queues.find((item) => item.name === 'background');
  expect(queue).toBeDefined();
  return queue;
}

test('administrator operates the native queue panel on desktop and mobile', async ({
  page,
  baseURL,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let wasPaused;

  try {
    const board = await openBoard(page);
    await board.getByRole('link', { name: 'background', exact: true }).first().click();
    await expect(board.getByRole('heading', { name: 'background', exact: true })).toBeVisible();
    const originalQueue = await getBackgroundQueue(page);
    wasPaused = originalQueue.isPaused;
    expect(originalQueue.readOnlyMode).toBe(false);

    async function setQueuePaused(isPaused) {
      // The upstream queue action trigger is icon-only; scope it to the queue status bar.
      await board.locator('[class*="statusBar-"] button[aria-haspopup="menu"]').click();
      await expect(board.getByRole('menuitem', { name: '添加作业', exact: true })).toBeEnabled();
      await board.getByRole('menuitem', { name: isPaused ? '暂停' : '恢复', exact: true }).click();
      await expect(
        board.getByText(isPaused ? '您确定要暂停队列处理吗？' : '您确定要恢复队列处理吗？'),
      ).toBeVisible();
      const pendingResponse = page.waitForResponse(
        `${baseURL}${BOARD_PATH}/api/queues/background/${isPaused ? 'pause' : 'resume'}`,
      );
      await board.getByRole('button', { name: '确认', exact: true }).click();
      const response = await pendingResponse;
      expect(response.status()).toBe(200);
      expect(response.request().method()).toBe('PUT');
      expect(await response.request().headerValue('x-xsrf-token')).toBeTruthy();
      await expect.poll(async () => (await getBackgroundQueue(page)).isPaused).toBe(isPaused);
      await expect(
        board.getByRole('button', { name: '确认', exact: true, includeHidden: true }),
      ).toBeHidden();
    }

    await setQueuePaused(!wasPaused);
    await setQueuePaused(wasPaused);

    await mkdir('.local/screenshots', { recursive: true });
    await page.screenshot({ path: '.local/screenshots/job-board-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('region', { name: '后台任务面板', exact: true })).toBeVisible();
    // Bull Board replaces its desktop queue heading with a queue selector on mobile.
    await expect(board.getByRole('button', { name: 'background', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.local/screenshots/job-board-mobile.png', fullPage: true });

    await page.getByRole('button', { name: '打开导航菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '用户管理', exact: true }).click();
    await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible();
    await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);
    await page.getByRole('button', { name: '打开导航菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '后台任务', exact: true }).click();
    await expect(page.getByRole('region', { name: '后台任务面板', exact: true })).toBeVisible();
    await expect(
      board.getByRole('link', { name: 'background', exact: true }).first(),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (typeof wasPaused === 'boolean' && (await getBackgroundQueue(page)).isPaused !== wasPaused) {
      // Cleanup also runs when a UI assertion fails after pausing the queue.
      await page.request.get(`${BOARD_PATH}/_status`);
      const cookies = await page.context().cookies(`${baseURL}${BOARD_PATH}`);
      const csrfCookie = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN');
      expect(csrfCookie).toBeDefined();
      const response = await page.request.put(
        `${BOARD_PATH}/api/queues/background/${wasPaused ? 'pause' : 'resume'}`,
        { headers: { 'X-XSRF-TOKEN': decodeURIComponent(csrfCookie.value) } },
      );
      expect(response.status()).toBe(200);
    }
  }
});

test('a failed iframe document shows an error and retry reloads the panel', async ({ page }) => {
  await page.route(`**${BOARD_PATH}`, (route) =>
    route.fulfill({ status: 503, json: { error: 'ERRORS.INTERNAL_SERVER_ERROR' } }),
  );
  await page.goto('/admin/jobs');
  const error = page.getByRole('alert').filter({ hasText: '后台任务面板加载失败' });
  await expect(error).toBeVisible();
  await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);

  await page.unroute(`**${BOARD_PATH}`);
  await error.getByRole('button', { name: '重试', exact: true }).click();
  await expect(error).toBeHidden();
  await expect(
    page
      .frameLocator(FRAME_SELECTOR)
      .getByRole('link', { name: 'background', exact: true })
      .first(),
  ).toBeVisible();
});

test('a failed status check unloads the panel and retry reconnects it', async ({ page }) => {
  await page.clock.install();
  const board = await openBoard(page);
  await page.route(STATUS_PATTERN, (route) =>
    route.fulfill({
      status: 503,
      json: {
        status: false,
        data: {},
        error: { code: 'JOB_BOARD_UNAVAILABLE', message: '后台任务服务暂时不可用，请稍后重试' },
      },
    }),
  );

  const failedStatus = page.waitForResponse(STATUS_PATTERN);
  await page.clock.fastForward(31_000);
  expect((await failedStatus).status()).toBe(503);
  const error = page.getByRole('alert').filter({ hasText: '后台任务服务暂时不可用' });
  await expect(error).toBeVisible();
  await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);

  await page.unroute(STATUS_PATTERN);
  const recoveredStatus = page.waitForResponse(STATUS_PATTERN);
  await error.getByRole('button', { name: '重试', exact: true }).click();
  expect((await recoveredStatus).status()).toBe(200);
  await expect(error).toBeHidden();
  await expect(board.getByRole('link', { name: 'background', exact: true }).first()).toBeVisible();
});

test('an expired panel session returns the outer page to login', async ({ page }) => {
  await page.clock.install();
  await openBoard(page);
  // Remove only this browser's cookie; the shared database session remains intact.
  await page.context().clearCookies({ name: 'starter_session' });
  await page.route(STATUS_PATTERN, (route) =>
    route.fulfill({
      status: 401,
      json: {
        status: false,
        data: {},
        error: { code: 'UNAUTHENTICATED', message: '登录已失效，请重新登录' },
      },
    }),
  );

  const expiredStatus = page.waitForResponse(STATUS_PATTERN);
  await page.clock.fastForward(31_000);
  expect((await expiredStatus).status()).toBe(401);
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('region', { name: '登录工作台' })).toBeVisible();
  await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);
});
