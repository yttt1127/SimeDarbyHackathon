import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3001', channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:3001/api/state', reuseExistingServer: true, timeout: 30000 },
});
