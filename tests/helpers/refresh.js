import { expect } from '@playwright/test';

export async function expectListRefreshRecovery(page, requestPattern, record) {
  await expect(record).toBeVisible();
  const pagination = page.locator('.arco-pagination');
  const previousPagination = await pagination.innerText();
  const currentPage = pagination.locator('[aria-current="true"]');
  const previousPage = await currentPage.innerText();
  const error = page.getByRole('alert').filter({ hasText: '列表刷新暂不可用' });
  const failRequest = (route) =>
    route.fulfill({
      status: 503,
      json: {
        status: false,
        data: {},
        error: { code: 'TEMPORARY_ERROR', message: '列表刷新暂不可用' },
      },
    });

  await page.route(requestPattern, failRequest);
  try {
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(error).toBeVisible();
    await expect(record).toBeVisible();
    await expect(pagination).toHaveText(previousPagination, { useInnerText: true });
    await expect(currentPage).toHaveText(previousPage);

    const failedRetry = page.waitForResponse(requestPattern);
    await error.getByRole('button', { name: '重试', exact: true }).click();
    expect((await failedRetry).status()).toBe(503);
    await expect(record).toBeVisible();
    await expect(pagination).toHaveText(previousPagination, { useInnerText: true });
    await expect(currentPage).toHaveText(previousPage);

    await page.unroute(requestPattern, failRequest);
    const recovered = page.waitForResponse(requestPattern);
    await error.getByRole('button', { name: '重试', exact: true }).click();
    expect((await recovered).status()).toBe(200);
    await expect(error).toBeHidden();
    await expect(record).toBeVisible();
    await expect(pagination).toHaveText(previousPagination, { useInnerText: true });
    await expect(currentPage).toHaveText(previousPage);
  } finally {
    await page.unroute(requestPattern, failRequest);
  }
}
