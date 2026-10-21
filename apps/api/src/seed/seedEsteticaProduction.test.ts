import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { limitFactor } from '../config/limits.js';

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Entorno de producción válido, con una base inalcanzable: si el script llegara a conectar, fallaría por la red. */
const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://127.0.0.1:1/libro-no-existe',
  CORS_ORIGIN: 'https://ejemplo.com',
  APP_URL: 'https://ejemplo.com',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  ACCESS_TOKEN_SECRET: 'b'.repeat(48),
  MAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'clave-de-prueba-0000',
  MAIL_FROM: 'Universo Memorias <hola@ejemplo.com>',
};

describe('en producción', () => {
  it('RATE_LIMIT_MULTIPLIER se ignora siempre', () => {
    expect(limitFactor({ NODE_ENV: 'production', RATE_LIMIT_MULTIPLIER: 20 })).toBe(1);
    expect(limitFactor({ NODE_ENV: 'production' })).toBe(1);
    expect(limitFactor({ NODE_ENV: 'development', RATE_LIMIT_MULTIPLIER: 20 })).toBe(20);
    expect(limitFactor({ NODE_ENV: 'test' })).toBe(1);
  });

  it('seed:estetica se niega a correr, antes de tocar la base de datos', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed-estetica.ts'], {
      cwd: apiRoot,
      env: { ...process.env, ...PRODUCTION_ENV },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('no se cargan en producción');
    // No llegó a conectar ni a escribir nada.
    expect(`${run.stdout}${run.stderr}`).not.toMatch(/ECONNREFUSED|Cargado|Retirado|Libro:/);
  });

  it('seed:estetica también se niega con una base que no es local o con opciones mal escritas', () => {
    const run = (extraEnv: Record<string, string>, args: string[] = []) =>
      spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed-estetica.ts', ...args], {
        cwd: apiRoot,
        env: { ...process.env, NODE_ENV: 'development', ...extraEnv },
        encoding: 'utf8',
        timeout: 60_000,
      });
    const remote = run({ MONGODB_URI: 'mongodb://db.ejemplo.com:27017/libro' });
    expect(remote.status).toBe(1);
    expect(remote.stderr).toContain('no apunta a esta máquina');
    const typo = run({ MONGODB_URI: 'mongodb://127.0.0.1:1/libro-no-existe' }, ['-quitar']);
    expect(typo.status).toBe(1);
    expect(typo.stderr).toContain('Opción desconocida');
  });
});
