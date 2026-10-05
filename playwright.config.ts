import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'movil',
      // En local se usa el Edge instalado (sin descargar navegadores); en CI, Chromium de Playwright.
      use: { ...devices['Pixel 7'], ...(isCI ? {} : { channel: 'msedge' }) },
    },
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], ...(isCI ? {} : { channel: 'msedge' }) },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w apps/api',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w apps/web',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
