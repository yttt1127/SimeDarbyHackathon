import { test, expect, type Page } from '@playwright/test';
import type { Snapshot } from '../../packages/shared/types';

test('capacity colors follow sensor observations and show uncertainty on desktop and mobile', async ({ page, request }) => {
  const state = await (await request.get('/api/state')).json() as Snapshot;
  state.requests = [];
  state.config.boardingLimit = 16;
  const frames: ((data: string) => void)[] = [];
  await page.routeWebSocket('**/ws', socket => {
    frames.push(data => socket.send(data));
    socket.send(JSON.stringify(state));
  });
  await page.goto('/');
  await expect(page.getByText('Live connection')).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [count, tone, label] of [[9, 'available', 'Available'], [10, 'limited', 'Limited'], [14, 'limited', 'Limited'], [15, 'full', 'Nearly full'], [16, 'full', 'Full']] as const) {
      state.cars[0].observation = { count, uncertainty: 0, timestamp: 0 };
      state.cars[0].actualOccupancy = 0; // Deliberately different: never use private truth for passenger capacity.
      frames.forEach(send => send(JSON.stringify(state)));
      const lift = page.getByTestId('overview-Lift A');
      await expect(lift).toHaveClass(new RegExp(`tone-${tone}`));
      await expect(lift.getByTestId('capacity')).toHaveText(label);
    }
    state.cars[0].observation.uncertainty = 1;
    frames.forEach(send => send(JSON.stringify(state)));
    await expect(page.getByTestId('overview-Lift A').getByTestId('capacity')).toHaveText('Uncertain');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

async function changeFloor(page: Page, floor: string) {
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await page.getByRole('dialog', { name: 'Demo location' }).getByLabel('Simulated floor').selectOption(floor);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}

test('automatic assignment, pickup forecast and consistent independent views', async ({ page, browser, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dashboard');
  await expect(page.getByText('Live connection')).toBeVisible();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByTestId('sim-clock')).toHaveText('00:02.0');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const passenger = await context.newPage();
  passenger.on('pageerror', error => errors.push(error.message));
  const unexpected: string[] = [];
  passenger.on('request', r => { if (r.url().includes('/api/alternatives?') || r.url().includes('/api/reassign')) unexpected.push(r.url()); });
  await passenger.goto('/');
  await expect(passenger).toHaveTitle(/ZeroWait/);
  await expect(passenger.getByText('Live connection')).toBeVisible();
  await expect(passenger.getByRole('button', { name: /Select Lift|Choose Lift|Accept Lift/ })).toHaveCount(0);
  await expect(passenger.getByRole('radio')).toHaveCount(0);
  await expect(passenger.getByTestId('pickup-eta')).toHaveCount(0);
  await passenger.getByRole('button', { name: 'Call a lift', exact: true }).click();
  const response = passenger.waitForResponse(r => r.url().endsWith('/api/request') && r.request().method() === 'POST');
  await passenger.getByRole('button', { name: 'Going Up', exact: false }).click();
  const assigned = await (await response).json();
  await expect(passenger.getByRole('heading', { name: `${assigned.assignedElevator} is on its way` })).toBeVisible();
  let state = await (await request.get('/api/state')).json() as Snapshot;
  const car = state.cars.find(c => c.id === assigned.assignedElevator)!;
  const pickup = car.stops.find(s => !s.serviced && s.pickupIds.includes(assigned.id))!;
  await expect(passenger.getByTestId('pickup-eta')).toHaveText(`ETA: ${Math.ceil(pickup.eta)} seconds`);
  await expect(passenger.getByRole('region', { name: 'Your assignment' }).getByText('Capacity: Available')).toBeVisible();
  await passenger.screenshot({ path: 'docs/screenshots/passenger.png', fullPage: true });
  await page.getByText('Run the capacity demonstration', { exact: false }).click();
  await page.getByRole('button', { name: 'Add lobby surge & advance 2s' }).click();
  await expect(passenger.getByRole('heading', { name: 'Lift A is on its way' })).toBeVisible();
  await expect(passenger.getByRole('region', { name: 'Your assignment' }).getByText('Capacity: Available')).toBeVisible();
  await expect(passenger.getByRole('button', { name: /Accept Lift/ })).toHaveCount(0);
  await passenger.screenshot({ path: 'docs/screenshots/passenger-capacity.png', fullPage: true });
  state = await (await request.get('/api/state')).json() as Snapshot;
  await passenger.getByRole('button', { name: 'Lift details', exact: true }).click();
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i];
    const overview = passenger.getByTestId(`overview-${car.id}`);
    await expect(overview.getByTestId('current-floor')).toHaveText(`${String(car.phase === 'MOVING' && car.direction === 'DOWN' ? Math.ceil(car.position - 1e-8) : Math.floor(car.position + 1e-8)).padStart(2, '0')}F`);
    await expect(overview.getByTestId('direction')).toContainText(car.direction);
    await expect(page.getByTestId(`lift-${i}`).getByTestId('scheduled-stop')).toHaveCount(car.stops.length);
    const floorDetails = passenger.getByRole('region', { name: `${car.id} route details` });
    const relevant = car.stops.filter(s => !s.serviced);
    await expect(overview.getByTestId('upcoming-stops')).toHaveText(relevant.map(s => String(s.floor).padStart(2, '0')).join(' → ') || 'No scheduled stops');
    await expect(floorDetails.getByTestId('floor-arrival')).toHaveCount(relevant.length);
    for (const stop of car.stops) {
      await expect(page.getByTestId(`lift-${i}`).getByText(`Floor ${stop.floor}`, { exact: false }).first()).toBeVisible();

    }
  }
  const details = passenger.getByRole('dialog', { name: 'Lift details' });
  await expect(details.getByTestId('floor-waiting')).toHaveText(String(state.lobbies.find(l => l.floor === assigned.origin)!.observation.count));
  await expect(details.getByText('Available', { exact: true }).first()).toBeVisible();
  await expect(details.getByText(/Observed occupancy|Before board|After stop|Free spaces|COMPLETE UPCOMING ROUTE/)).toHaveCount(0);
  await expect(details.getByTestId('scheduled-stop')).toHaveCount(0);
  await passenger.screenshot({ path: 'docs/screenshots/passenger-floor-details.png', fullPage: true });
  await passenger.getByRole('button', { name: 'Close lift details' }).click();
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

test('manual creation, own cancellation, step, pause and mobile layout', async ({ page }) => {
  await page.goto('/dashboard');
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
  await page.getByRole('button', { name: 'Call a lift', exact: true }).click();
  await page.getByRole('button', { name: 'Going Up', exact: false }).click();
  await page.getByRole('button', { name: 'Cancel my request' }).click();
  await expect(page.getByRole('heading', { name: 'Request cancelled', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Building overview', exact: false }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});



test('demo floor fallback, invalid directions and responsive informational lifts', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Live connection')).toBeVisible();
  await page.getByRole('button', { name: 'Reset simulation' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Passenger app', exact: false }).click();
  await expect(page.getByText('zerowait.')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByTestId('capacity').filter({ hasText: 'Available' })).toHaveCount(2);
  await expect(page.getByTestId('main-waiting')).toHaveText('0 people');
  await expect(page.getByTestId('overview-Lift A')).toHaveClass(/tone-available/);
  await expect(page.getByTestId('upcoming-stops').filter({ hasText: 'No scheduled stops' })).toHaveCount(2);
  await expect(page).toHaveURL(/\/$/);
  await page.screenshot({ path: 'docs/screenshots/passenger-redesign.png', fullPage: true });
  await page.getByRole('button', { name: 'Lift details', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Lift details' })).toBeVisible();
  await page.keyboard.press('Escape');
  for (const [floor, invalid] of [['10', 'Going Up'], ['1', 'Going Down']]) {
    await changeFloor(page, floor);
    await page.getByRole('button', { name: 'Call a lift', exact: true }).click();
    await expect(page.getByRole('button', { name: invalid, exact: false })).toBeDisabled();
    await page.keyboard.press('Escape');
  }
  await changeFloor(page, '');
  await page.getByRole('button', { name: 'Call a lift', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Going Up', exact: false })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Going Down', exact: false })).toBeDisabled();
  await page.getByRole('dialog', { name: 'Which direction are you going?' }).getByLabel('Simulated floor').selectOption('4');
  await expect(page.getByRole('button', { name: 'Going Up', exact: false })).toBeEnabled();
  await page.screenshot({ path: 'docs/screenshots/passenger-direction.png', fullPage: true });
  await page.keyboard.press('Escape');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('pending calls are locked, API failure can retry and cancellation preserves ownership', async ({ page, request }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Live connection')).toBeVisible();
  await page.getByRole('button', { name: 'Reset simulation' }).click();
  await page.getByRole('button', { name: 'Passenger app', exact: false }).click();
  let count = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/request', async route => {
    count++;
    if (count === 1) {
      await gate;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Please try again.' }) });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Call a lift', exact: true }).click();
  await page.getByRole('button', { name: 'Going Up', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Going Down', exact: false })).toBeDisabled();
  await page.getByRole('button', { name: 'Going Up', exact: false }).dispatchEvent('click');
  expect(count).toBe(1);
  release();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Please try again.');
  await expect(page.getByRole('button', { name: 'Going Up', exact: false })).toBeEnabled();
  await page.getByRole('button', { name: 'Going Up', exact: false }).click();
  await expect(page.getByRole('region', { name: 'Your assignment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lift requested', exact: false })).toBeDisabled();
  expect(count).toBe(2);
  const state = await (await request.get('/api/state')).json() as Snapshot;
  expect(state.requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Cancel my request' }).click();
  await expect(page.getByRole('heading', { name: 'Request cancelled' })).toBeVisible();
  const final = await (await request.get('/api/state')).json() as Snapshot;
  expect(final.requests[0].status).toBe('cancelled');
});

test('passenger aliases show reached integer floors during continuous travel', async ({ page, request }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Live connection')).toBeVisible();
  await page.getByRole('button', { name: 'Reset simulation' }).click();
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('liftflow-session')!));
  const headers = { 'X-Session-Token': session.token };
  await request.post('/api/passengers', { headers, data: { origin: 7, destination: 1, count: 1 } });
  await request.post('/api/control', { headers, data: { action: 'step' } });
  const state = await (await request.get('/api/state')).json() as Snapshot;
  expect(state.cars[0].position).toBeGreaterThan(1);
  expect(state.cars[0].position).toBeLessThan(2);
  for (const path of ['/', '/passenger']) {
    await page.goto(path);
    await expect(page.getByTestId('overview-Lift A').getByTestId('current-floor')).toHaveText('01F');
    await expect(page.getByTestId('overview-Lift A').getByTestId('direction')).toContainText('UP');
    await expect(page.getByTestId('overview-Lift A').getByTestId('upcoming-stops')).toHaveText('07');
    await expect(page.getByRole('button', { name: 'Call a lift', exact: true })).toBeVisible();
  }
});
