import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Cada archivo de prueba levanta su propio MongoDB en memoria: pocos a la vez evita fallos por falta de recursos.
    maxWorkers: 4,
    testTimeout: 15000,
    hookTimeout: 180000, // la primera vez mongodb-memory-server descarga el binario de MongoDB
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-utils/**', 'src/scripts/**', 'src/server.ts'],
      reporter: ['text-summary', 'json-summary'],
      // Piso de calidad: baja solo con una razón. Los servicios críticos (auth, motor de quiz, progresión, acceso)
      // tienen un piso propio más exigente que el global.
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 90,
        branches: 80,
        'src/services/auth.service.ts': { lines: 90, branches: 80 },
        'src/services/quiz-engine.ts': { lines: 90, branches: 80 },
        'src/services/progress.service.ts': { lines: 90, branches: 85 },
        'src/services/access.service.ts': { lines: 90, branches: 85 },
        'src/services/quiz.service.ts': { lines: 95, branches: 75 },
      },
    },
  },
});
