import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Cada archivo de prueba levanta su propio MongoDB en memoria: pocos a la vez evita fallos por falta de recursos.
    maxWorkers: 4,
    testTimeout: 15000,
    hookTimeout: 180000, // la primera vez mongodb-memory-server descarga el binario de MongoDB
  },
});
