import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Precarga las letras que se ven en el primer pintado: Cinzel (el titular, que es el LCP) y Jost (la presentación y los
 * botones), ambas en su subconjunto latino. Sin esto se descubren cuando el CSS ya se descargó y se analizó, y el texto
 * se pinta con la letra de reserva y salta al llegar la real. Toma los nombres con hash del build.
 */
function preloadFirstPaintFonts(): Plugin {
  const wanted = [/cinzel-latin-wght-normal[^/]*\.woff2$/, /jost-latin-wght-normal[^/]*\.woff2$/];
  return {
    name: 'preload-first-paint-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const names = Object.keys(ctx.bundle ?? {});
        return wanted.flatMap((pattern) => {
          const file = names.find((name) => pattern.test(name));
          if (!file) return [];
          return [
            {
              tag: 'link',
              attrs: {
                rel: 'preload',
                as: 'font',
                type: 'font/woff2',
                crossorigin: '',
                href: `/${file}`,
              },
              injectTo: 'head' as const,
            },
          ];
        });
      },
    },
  };
}

const API_TARGET = process.env['VITE_API_PROXY_TARGET'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFirstPaintFonts()],
  server: {
    port: 5173,
    // En desarrollo el navegador habla con el mismo origen (:5173); Vite reenvía /api al backend.
    // Así las cookies httpOnly del refresh funcionan igual que en producción (mismo sitio).
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
