import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

/** Base de datos propia de las pruebas E2E (nunca la de desarrollo). */
export const E2E_DB_URI = 'mongodb://127.0.0.1:27017/libro-e2e';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
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
  // Se levantan en orden: MongoDB → API → web (el API necesita la base de datos al arrancar).
  webServer: [
    {
      command: 'npm run dev:db -w apps/api',
      port: 27017,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w apps/api',
      url: 'http://localhost:3000/api/health',
      env: { MONGODB_URI: E2E_DB_URI },
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
