import { describe, expect, it } from 'vitest';
import { assertNoSeedVariables, EnvError, parseEnv } from './env.js';

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

  it('Cloudinary: las tres variables juntas o ninguna', () => {
    expect(parseEnv({ NODE_ENV: 'test' }).CLOUDINARY_API_KEY).toBeUndefined();
    const all = {
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: '123',
      CLOUDINARY_API_SECRET: 'abc',
    };
    expect(parseEnv({ NODE_ENV: 'test', ...all }).CLOUDINARY_CLOUD_NAME).toBe('demo');
    expect(() => parseEnv({ NODE_ENV: 'test', CLOUDINARY_CLOUD_NAME: 'demo' })).toThrow(EnvError);
  });

  it('ACCESS_TOKEN_SECRET: corta o igual al JWT se rechaza y en desarrollo hay un valor por defecto', () => {
    expect(parseEnv({ NODE_ENV: 'development' }).ACCESS_TOKEN_SECRET.length).toBeGreaterThanOrEqual(
      32,
    );
    expect(() => parseEnv({ NODE_ENV: 'test', ACCESS_TOKEN_SECRET: 'corta' })).toThrow(
      /ACCESS_TOKEN_SECRET/,
    );
    const same = 'x'.repeat(40);
    expect(() =>
      parseEnv({ NODE_ENV: 'test', JWT_ACCESS_SECRET: same, ACCESS_TOKEN_SECRET: same }),
    ).toThrow(/distinta de JWT_ACCESS_SECRET/);
  });

  it('en producción el desbloqueo por QR va encendido por defecto; fuera, apagado; y se puede forzar', () => {
    const prod = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/x',
      CORS_ORIGIN: 'https://app.ejemplo.com',
      JWT_ACCESS_SECRET: 'Jx7vQ2mP9sLk4RtW8nBz3YcD6fGh1aUe5oIq0XvN',
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: '123456',
      CLOUDINARY_API_SECRET: 'secreto-de-prueba',
      ACCESS_TOKEN_SECRET: 'Qh3kT8wZr1NbV6yMcP4sLd9fGj2XaUe7oIq5RtWn',
      APP_URL: 'https://app.ejemplo.com',
      MAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'clave-de-prueba',
      MAIL_FROM: 'Libro <a@ejemplo.com>',
    };
    expect(parseEnv(prod).REQUIRE_QR_UNLOCK).toBe(true);
    expect(parseEnv({ ...prod, REQUIRE_QR_UNLOCK: 'false' }).REQUIRE_QR_UNLOCK).toBe(false);
    expect(parseEnv({ NODE_ENV: 'development' }).REQUIRE_QR_UNLOCK).toBe(false);
  });

  it('S3: las cuatro variables juntas o ninguna', () => {
    const all = {
      S3_ENDPOINT: 'https://cuenta.r2.cloudflarestorage.com',
      S3_BUCKET: 'privado',
      S3_ACCESS_KEY_ID: 'a',
      S3_SECRET_ACCESS_KEY: 'b',
    };
    const env = parseEnv({ NODE_ENV: 'test', ...all });
    expect([env.S3_REGION, env.S3_FORCE_PATH_STYLE]).toEqual(['auto', true]);
    expect(parseEnv({ NODE_ENV: 'test' }).S3_BUCKET).toBeUndefined();
    expect(() => parseEnv({ NODE_ENV: 'test', S3_BUCKET: 'privado' })).toThrow(EnvError);
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
      expect(problems).toContain('ACCESS_TOKEN_SECRET');
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
      JWT_ACCESS_SECRET: 'Jx7vQ2mP9sLk4RtW8nBz3YcD6fGh1aUe5oIq0XvN',
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: '123456',
      CLOUDINARY_API_SECRET: 'secreto-de-prueba',
      ACCESS_TOKEN_SECRET: 'Qh3kT8wZr1NbV6yMcP4sLd9fGj2XaUe7oIq5RtWn',
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
      JWT_ACCESS_SECRET: 'Jx7vQ2mP9sLk4RtW8nBz3YcD6fGh1aUe5oIq0XvN',
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: '123456',
      CLOUDINARY_API_SECRET: 'secreto-de-prueba',
      ACCESS_TOKEN_SECRET: 'Qh3kT8wZr1NbV6yMcP4sLd9fGj2XaUe7oIq5RtWn',
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

  describe('reglas solo de producción', () => {
    const prod = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/x',
      CORS_ORIGIN: 'https://app.ejemplo.com',
      JWT_ACCESS_SECRET: 'Jx7vQ2mP9sLk4RtW8nBz3YcD6fGh1aUe5oIq0XvN',
      ACCESS_TOKEN_SECRET: 'Qh3kT8wZr1NbV6yMcP4sLd9fGj2XaUe7oIq5RtWn',
      APP_URL: 'https://app.ejemplo.com',
      MAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'clave-de-prueba',
      MAIL_FROM: 'Libro <a@ejemplo.com>',
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: '123456',
      CLOUDINARY_API_SECRET: 'secreto-de-prueba',
    };
    const problemsOf = (source: NodeJS.ProcessEnv): string => {
      try {
        parseEnv(source);
      } catch (error) {
        return (error as EnvError).problems.join('\n');
      }
      return '';
    };

    it('la configuración completa pasa', () => {
      expect(problemsOf(prod)).toBe('');
    });

    it('exige el nombre de nube de Cloudinary (sin ella no hay de dónde cargar imágenes)', () => {
      const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, ...rest } = prod;
      void [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET];
      expect(problemsOf(rest)).toContain('CLOUDINARY_CLOUD_NAME');
      // En desarrollo y pruebas sigue siendo opcional.
      expect(parseEnv({ NODE_ENV: 'test' }).CLOUDINARY_CLOUD_NAME).toBeUndefined();
    });

    it('rechaza secretos de desarrollo o repetitivos, sin citar su valor', () => {
      const devSecret = 'solo-para-desarrollo-no-usar-en-produccion-0123456789';
      const repeated = 'a'.repeat(48);
      const messages = problemsOf({
        ...prod,
        JWT_ACCESS_SECRET: devSecret,
        ACCESS_TOKEN_SECRET: repeated,
      });
      expect(messages).toContain('JWT_ACCESS_SECRET');
      expect(messages).toContain('ACCESS_TOKEN_SECRET');
      expect(messages).not.toContain(devSecret);
      expect(messages).not.toContain(repeated);
    });

    it('rechaza RATE_LIMIT_MULTIPLIER y direcciones inseguras o locales', () => {
      expect(problemsOf({ ...prod, RATE_LIMIT_MULTIPLIER: '20' })).toContain(
        'RATE_LIMIT_MULTIPLIER',
      );
      expect(problemsOf({ ...prod, APP_URL: 'http://app.ejemplo.com' })).toContain('APP_URL');
      expect(problemsOf({ ...prod, APP_URL: 'https://localhost:5173' })).toContain('APP_URL');
      expect(
        problemsOf({ ...prod, CORS_ORIGIN: 'https://app.ejemplo.com,http://x.ejemplo.com' }),
      ).toContain('CORS_ORIGIN');
      expect(problemsOf({ ...prod, CORS_ORIGIN: 'https://app.localhost' })).toContain(
        'CORS_ORIGIN',
      );
    });

    it('fuera de producción nada de esto se exige', () => {
      expect(() =>
        parseEnv({
          NODE_ENV: 'development',
          RATE_LIMIT_MULTIPLIER: '20',
          APP_URL: 'http://localhost:5173',
        }),
      ).not.toThrow();
    });

    it('el servidor se niega a arrancar en producción con variables SEED_*, sin citar su valor', () => {
      expect(() =>
        assertNoSeedVariables({ NODE_ENV: 'development', SEED_ADMIN_PASSWORD: 'x' }),
      ).not.toThrow();
      expect(() => assertNoSeedVariables({ NODE_ENV: 'production' })).not.toThrow();
      try {
        assertNoSeedVariables({
          NODE_ENV: 'production',
          SEED_ADMIN_PASSWORD: 'Contrasena-Secreta-1',
        });
        expect.unreachable();
      } catch (error) {
        const text = (error as EnvError).problems.join('\n');
        expect(text).toContain('SEED_ADMIN_PASSWORD');
        expect(text).not.toContain('Contrasena-Secreta-1');
      }
    });
  });
});
