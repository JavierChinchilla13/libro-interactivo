import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env.js';

describe('parseEnv', () => {
  it('en desarrollo usa valores por defecto', () => {
    const env = parseEnv({ NODE_ENV: 'development' });
    expect(env.PORT).toBe(3000);
    expect(env.MONGODB_URI).toMatch(/^mongodb:\/\//);
    expect(env.CORS_ORIGIN).toEqual(['http://localhost:5173']);
  });

  it('separa varios orígenes de CORS por coma', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      CORS_ORIGIN: 'https://app.ejemplo.com, https://www.ejemplo.com',
    });
    expect(env.CORS_ORIGIN).toEqual(['https://app.ejemplo.com', 'https://www.ejemplo.com']);
  });

  it('en producción exige MONGODB_URI y CORS_ORIGIN (sin valores por defecto)', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(EnvError);
    try {
      parseEnv({ NODE_ENV: 'production' });
    } catch (error) {
      const problems = (error as EnvError).problems.join('\n');
      expect(problems).toContain('MONGODB_URI');
      expect(problems).toContain('CORS_ORIGIN');
      expect(problems).toContain('JWT_ACCESS_SECRET');
    }
  });

  it('rechaza valores inválidos con un mensaje claro', () => {
    expect(() => parseEnv({ NODE_ENV: 'development', PORT: 'abc' })).toThrow(/PORT/);
    expect(() => parseEnv({ NODE_ENV: 'development', MONGODB_URI: 'mysql://x' })).toThrow(
      /MONGODB_URI/,
    );
    expect(() => parseEnv({ NODE_ENV: 'development', CORS_ORIGIN: 'no-es-url' })).toThrow(
      /CORS_ORIGIN/,
    );
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rechaza un JWT_ACCESS_SECRET corto', () => {
    expect(() => parseEnv({ NODE_ENV: 'development', JWT_ACCESS_SECRET: 'corta' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('acepta una configuración de producción completa', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://cluster-de-prueba.example.net/libro',
      CORS_ORIGIN: 'https://app.ejemplo.com',
      JWT_ACCESS_SECRET: 'a'.repeat(40),
      PORT: '10000',
    });
    expect(env.PORT).toBe(10000);
    expect(env.NODE_ENV).toBe('production');
  });
});
