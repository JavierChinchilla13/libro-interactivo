import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

/** Base de datos propia de las pruebas E2E (nunca la de desarrollo). */
export const E2E_DB_URI = 'mongodb://127.0.0.1:27017/libro-e2e';

/**
 * Puertos propios de las E2E: no chocan con `npm run dev` (3000 / 5173) y nunca se reutiliza por error el API de
 * desarrollo, que apunta a otra base de datos y tiene su propio límite de intentos de ingreso.
 */
const API_PORT = 3100;
const WEB_PORT = 5273;
export const E2E_BASE_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // La primera carga en frío de Vite compila TipTap y el panel: se da más margen a las aserciones.
  expect: { timeout: 10_000 },
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E_BASE_URL,
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
      url: `http://localhost:${API_PORT}/api/health`,
      // En la E2E el desbloqueo por QR va encendido (como en producción).
      env: {
        PORT: String(API_PORT),
        MONGODB_URI: E2E_DB_URI,
        REQUIRE_QR_UNLOCK: 'true',
        CORS_ORIGIN: E2E_BASE_URL,
        APP_URL: E2E_BASE_URL,
      },
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: `npm run dev -w apps/web -- --port ${WEB_PORT} --strictPort`,
      url: E2E_BASE_URL,
      env: { VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
