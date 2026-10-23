import { test, expect } from '@playwright/test';

for (const width of [375, 390, 1440]) {
  test(`navigation, history, branding and preserved request at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByText('Live connection')).toBeVisible();
    await page.getByRole('button', { name: 'Reset simulation' }).click();
    await page.goto('/');
    await expect(page).toHaveTitle('ZeroWait · Your next ride');
    const nav = page.getByRole('navigation', { name: 'App navigation' });
    await expect(nav.getByRole('button', { name: 'Passenger App' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Call a lift', exact: true }).click();
    await page.getByRole('button', { name: 'Going Up' }).click();
    const assignment = page.getByRole('region', { name: 'Your assignment' });
    await expect(assignment).toBeVisible();
    const assigned = await assignment.getByRole('heading').textContent();
    await nav.getByRole('button', { name: 'Simulator', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page).toHaveTitle('ZeroWait · Simulator');
    await expect(nav.getByRole('button', { name: 'Simulator' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.stat')).toHaveCount(3);
    await expect(page.getByText(/A better view|Every journey connected|The full picture|Journeys completed|MODEL SETTINGS/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+1s Step' })).not.toBeVisible();
    for (const label of ['Start / resume', 'Reset simulation', 'Add passengers', 'Generate traffic', 'Load'])
      await expect(page.getByRole('button', { name: label, exact: false }).first()).toBeVisible();
    await expect(page.getByLabel('Playback speed')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Simulator', exact: true })).toBeVisible();
    await page.goBack();
    await expect(assignment.getByRole('heading')).toHaveText(assigned!);
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Simulator', exact: true })).toBeVisible();
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, cls: el.className, right: el.getBoundingClientRect().right })))).toEqual([]);
    await expect(page.locator('body')).not.toContainText(/liftflow/i);
    await page.screenshot({ path: `docs/screenshots/v023-simulator-${width}.png`, fullPage: true });
    await nav.getByRole('button', { name: 'Passenger App' }).click();
    await expect(assignment.getByRole('heading')).toHaveText(assigned!);
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, cls: el.className, right: el.getBoundingClientRect().right })))).toEqual([]);
    for (const button of await nav.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `docs/screenshots/v023-passenger-${width}.png`, fullPage: true });
    await page.goto('/passenger');
    await expect(assignment.getByRole('heading')).toHaveText(assigned!);
    await page.getByRole('button', { name: 'Cancel my request' }).click();
    await expect(page.getByRole('heading', { name: 'Request cancelled' })).toBeVisible();
  });
}
