import { test, expect, type Page } from '@playwright/test';
import type { Snapshot } from '../../packages/shared/types';
import { createApp } from '../../apps/server/api';
import { resolveRuntimeConfig } from '../../apps/server/runtime';

async function dashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByText('Live connection')).toBeVisible();
  await expect(page.getByText(/MODEL SETTINGS|The live log|BUILDING ACTIVITY/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Apply settings & reset' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset simulation' }).click();
}
async function addTwo(page: Page) {
  await page.getByRole('button', { name: 'Add passengers', exact: false }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Origin floor').fill('3');
  await dialog.getByLabel('Destination floor').fill('8');
  await dialog.getByLabel('Passengers', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Add 2 passengers' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Added 2 passengers at floor 3.' })).toBeVisible();
}

test('manual creation is immediate while paused, including after reset', async ({ page, request }) => {
  await dashboard(page);
  for (let run = 0; run < 2; run++) {
    await addTwo(page);
    const state = await (await request.get('/api/state')).json() as Snapshot;
    expect(state.running).toBe(false);
    expect(state.now).toBe(0);
    expect(state.requests.filter(r => r.status === 'waiting')).toHaveLength(2);
    expect(state.cars.flatMap(c => c.stops).flatMap(s => s.pickupIds)).toHaveLength(2);
    await expect(page.locator('.stat').filter({ hasText: 'Passengers waiting' }).locator('strong')).toHaveText('02');
    await expect(page.getByText('Pickup 2', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Reset simulation' }).click();
    await expect(page.getByTestId('pending-arrivals')).toHaveText('0');
  }
});

test('Generate traffic starts once, shows pending count, obeys pause/resume and reset', async ({ page, request }) => {
  await dashboard(page);
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/traffic', async route => { calls++; if (calls === 1) await gate; await route.continue(); });
  const generate = page.getByRole('button', { name: 'Generate traffic', exact: false });
  await generate.click();
  await expect(generate).toBeDisabled();
  await generate.dispatchEvent('click');
  expect(calls).toBe(1);
  release();
  await expect(page.getByRole('status').filter({ hasText: 'Scheduled 8 residential arrivals. Simulation running.' })).toBeVisible();
  await expect(page.getByTestId('pending-arrivals')).toHaveText('8');
  await expect(page.getByRole('button', { name: 'Pause', exact: false })).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/state')).json()).requests.length, { timeout: 10000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: false }).click();
  const paused = await (await request.get('/api/state')).json() as Snapshot;
  expect(paused.pendingArrivals).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  const still = await (await request.get('/api/state')).json() as Snapshot;
  expect(still.now).toBe(paused.now);
  expect(still.pendingArrivals).toBe(paused.pendingArrivals);
  expect(still.requests.length).toBe(paused.requests.length);
  await page.getByRole('button', { name: 'Start / resume', exact: false }).click();
  await expect.poll(async () => (await (await request.get('/api/state')).json()).pendingArrivals, { timeout: 12000 }).toBeLessThan(paused.pendingArrivals);
  await page.getByRole('button', { name: 'Reset simulation' }).click();
  await expect(page.getByTestId('pending-arrivals')).toHaveText('0');
  await generate.click();
  await expect(page.getByTestId('pending-arrivals')).toHaveText('8');
  expect(calls).toBe(2);
  await page.getByRole('button', { name: 'Pause', exact: false }).click();
});

test('manual invalid inputs and backend failures remain visible in the open form', async ({ page }) => {
  await dashboard(page);
  await page.getByRole('button', { name: 'Add passengers', exact: false }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Destination floor').fill('1');
  await dialog.getByRole('button', { name: 'Add 1 passenger', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Choose distinct floors');
  await dialog.getByLabel('Destination floor').fill('8');
  await dialog.getByLabel('Passengers', { exact: true }).fill('101');
  await dialog.getByRole('button', { name: 'Add 101 passengers' }).click();
  await expect(dialog.getByRole('alert')).toContainText('1 to 100');
  await dialog.getByLabel('Passengers', { exact: true }).fill('2');
  await page.route('**/api/passengers', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Example backend failure' }) }));
  await dialog.getByRole('button', { name: 'Add 2 passengers' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Example backend failure');
  await expect(dialog.getByRole('button', { name: 'Add 2 passengers' })).toBeEnabled();
  await page.unroute('**/api/passengers');
  await dialog.getByRole('button', { name: 'Add 2 passengers' }).click();
  await expect(dialog).not.toBeVisible();
});

test('corrupt saved sessions and command-time expiry recover without duplicate creation', async ({ page, request }) => {
  await page.addInitScript(() => sessionStorage.setItem('liftflow-session', '{broken'));
  await dashboard(page);
  const original = await page.evaluate(() => JSON.parse(sessionStorage.getItem('liftflow-session')!).token);
  let attempts = 0;
  await page.route('**/api/passengers', async route => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Session expired; reload the app' }) });
    else await route.continue();
  });
  await addTwo(page);
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('liftflow-session')!).token)).not.toBe(original);
  expect((await (await request.get('/api/state')).json()).requests).toHaveLength(2);
});

test('both dashboard actions recover after an actual server restart', async ({ page }) => {
  const runtime = resolveRuntimeConfig({});
  let app = createApp(undefined, runtime);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const port = (app.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  runtime.allowedOrigins.add(base);
  try {
    await page.goto(base + '/dashboard');
    await expect(page.getByText('Live connection')).toBeVisible();
    await addTwo(page);
    const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('liftflow-session')!).token);
    await app.close();
    await expect(page.getByText('Live connection', { exact: true })).not.toBeVisible();
    app = createApp(undefined, runtime);
    await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
    await expect(page.getByText('Live connection')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('liftflow-session')!).token)).not.toBe(token);
    await addTwo(page);
    expect(app.simulation.requests.filter(r => r.status === 'waiting')).toHaveLength(2);
    await page.getByRole('button', { name: 'Generate traffic', exact: false }).click();
    await expect(page.getByTestId('pending-arrivals')).toHaveText('8');
    expect(app.simulation.running).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally { await app.close(); }
});
