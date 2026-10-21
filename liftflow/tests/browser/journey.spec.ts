import { test, expect } from '@playwright/test';
import type { Snapshot } from '../../packages/shared/types';

test('live capacity switch, full routes and consistent independent views', async ({ page, browser, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Live connection')).toBeVisible();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByTestId('sim-clock')).toHaveText('00:02.0');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const passenger = await context.newPage();
  passenger.on('pageerror', error => errors.push(error.message));
  await passenger.goto('/passenger');
  await expect(passenger.getByText('Live connection')).toBeVisible();
  await passenger.getByLabel('Your floor').selectOption('4');
  await passenger.getByRole('button', { name: 'Going up' }).click();
  await expect(passenger.getByRole('heading', { name: 'Lift B is assigned' })).toBeVisible();
  await passenger.getByRole('button', { name: 'Add lobby surge & advance 2s' }).click();
  await expect(passenger.getByText('Likely insufficient boarding space.', { exact: false })).toBeVisible();
  await expect(passenger.getByRole('button', { name: 'Accept Lift A' })).toBeVisible();
  await passenger.screenshot({ path: 'docs/screenshots/passenger-capacity.png', fullPage: true });
  await passenger.getByRole('button', { name: 'Accept Lift A' }).click();
  await expect(passenger.getByRole('heading', { name: 'Lift A is assigned' })).toBeVisible();
  const state = await (await request.get('/api/state')).json() as Snapshot;
  for (let i = 0; i < state.cars.length; i++) {
    const count = state.cars[i].stops.length;
    await expect(page.getByTestId(`lift-${i}`).getByTestId('scheduled-stop')).toHaveCount(count);
    await expect(passenger.getByTestId(`lift-${i}`).getByTestId('scheduled-stop')).toHaveCount(count);
    for (const stop of state.cars[i].stops) {
      await expect(page.getByTestId(`lift-${i}`).getByText(`Floor ${stop.floor}`, { exact: false }).first()).toBeVisible();
      await expect(passenger.getByTestId(`lift-${i}`).getByText(`Floor ${stop.floor}`, { exact: false }).first()).toBeVisible();
    }
  }
  expect(state.cars[1].stops.some(s => s.floor === 4)).toBe(false);
  expect(state.cars[1].stops.find(s => s.floor === 10)!.dropoffIds).toHaveLength(10);
  expect(await passenger.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/dashboard.png', fullPage: true });
  await passenger.screenshot({ path: 'docs/screenshots/passenger.png', fullPage: true });
  expect(errors).toEqual([]);
  await context.close();
});

test('manual creation, own cancellation, step, pause and mobile layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Live connection')).toBeVisible();
  await page.getByRole('button', { name: 'Reset simulation' }).click();
  await page.getByRole('button', { name: 'Add passengers', exact: false }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Origin floor').fill('3');
  await dialog.getByLabel('Destination floor').fill('8');
  await dialog.getByLabel('Passengers', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Add 2 passengers' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Pickup 2', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '+1s Step', exact: true }).click();
  await expect(page.getByTestId('sim-clock')).toHaveText('00:01.0');
  await page.getByRole('button', { name: 'Start / resume', exact: false }).click();
  await page.getByRole('button', { name: 'Pause', exact: false }).click();
  const time = await page.getByTestId('sim-clock').textContent();
  await page.waitForTimeout(350);
  await expect(page.getByTestId('sim-clock')).toHaveText(time!);
  await page.getByRole('button', { name: 'Reset simulation' }).click();
  await page.getByRole('button', { name: 'Passenger app', exact: false }).click();
  await page.getByRole('button', { name: 'Going up' }).click();
  await page.getByRole('button', { name: 'Cancel my request' }).click();
  await expect(page.getByRole('heading', { name: 'Request cancelled', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Building overview', exact: false }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
