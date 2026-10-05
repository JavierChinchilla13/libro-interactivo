import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 180000, // la primera vez mongodb-memory-server descarga el binario de MongoDB
  },
});
