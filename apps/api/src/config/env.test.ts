import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env.js';

describe('parseEnv', () => {
  it('en desarrollo usa valores por defecto', () => {
    const env = parseEnv({ NODE_ENV: 'development' });
    expect(env.PORT).toBe(3000);
    expect(env.MONGODB_URI).toMatch(/^mongodb:\/\//);
    expect(env.CORS_ORIGIN).toEqual(['http://localhost:5173']);
  });

  it('REQUIRE_QR_UNLOCK está apagado por defecto, se enciende con "true" y rechaza otros valores', () => {
    expect(parseEnv({ NODE_ENV: 'test' }).REQUIRE_QR_UNLOCK).toBe(false);
    expect(parseEnv({ NODE_ENV: 'test', REQUIRE_QR_UNLOCK: 'true' }).REQUIRE_QR_UNLOCK).toBe(true);
    expect(() => parseEnv({ NODE_ENV: 'test', REQUIRE_QR_UNLOCK: 'si' })).toThrow(EnvError);
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
      expect(problems).toContain('APP_URL');
      expect(problems).toContain('MAIL_PROVIDER');
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
      APP_URL: 'https://app.ejemplo.com/',
      MAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_clave_de_prueba',
      MAIL_FROM: 'Libro Interactivo <avisos@ejemplo.com>',
      PORT: '10000',
    });
    expect(env.PORT).toBe(10000);
    expect(env.APP_URL).toBe('https://app.ejemplo.com'); // sin barra final
    expect(env.NODE_ENV).toBe('production');
  });

  describe('correo', () => {
    const prod = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/x',
      CORS_ORIGIN: 'https://app.ejemplo.com',
      JWT_ACCESS_SECRET: 'p'.repeat(40),
      APP_URL: 'https://app.ejemplo.com',
    };

    it('en desarrollo el proveedor por defecto es memory', () => {
      expect(parseEnv({ NODE_ENV: 'development' }).MAIL_PROVIDER).toBe('memory');
    });

    it('en producción no permite memory (perdería los correos)', () => {
      expect(() => parseEnv({ ...prod, MAIL_PROVIDER: 'memory' })).toThrow(/MAIL_PROVIDER/);
    });

    it('gmail exige usuario y contraseña de aplicación y acepta la clave con espacios', () => {
      expect(() => parseEnv({ ...prod, MAIL_PROVIDER: 'gmail' })).toThrow(/GMAIL_USER/);
      const env = parseEnv({
        ...prod,
        MAIL_PROVIDER: 'gmail',
        GMAIL_USER: 'avisos@gmail.com',
        GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
      });
      expect(env.GMAIL_APP_PASSWORD).toBe('abcdefghijklmnop');
    });

    it('resend exige clave y remitente', () => {
      expect(() => parseEnv({ ...prod, MAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/);
      expect(() =>
        parseEnv({ ...prod, MAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_12345678' }),
      ).toThrow(/MAIL_FROM/);
    });

    it('valida el correo de contacto y el tiempo de vida del enlace de recuperación', () => {
      expect(() => parseEnv({ NODE_ENV: 'test', CONTACT_RECIPIENT_EMAIL: 'x' })).toThrow(
        /CONTACT_RECIPIENT_EMAIL/,
      );
      expect(() => parseEnv({ NODE_ENV: 'test', RESET_TOKEN_TTL_MINUTES: '1' })).toThrow(
        /RESET_TOKEN_TTL_MINUTES/,
      );
      expect(parseEnv({ NODE_ENV: 'test' }).RESET_TOKEN_TTL_MINUTES).toBe(30);
    });
  });
});
