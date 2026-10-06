import type { Transporter } from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../lib/logger.js';
import { createMailProvider } from './createMailProvider.js';
import { MailDeliveryError, MemoryMailProvider, type MailMessage } from './MailProvider.js';
import { ResendMailProvider } from './ResendMailProvider.js';
import { SmtpMailProvider, createGmailProvider } from './SmtpMailProvider.js';

const MESSAGE: MailMessage = {
  to: 'lectora@ejemplo.com',
  subject: 'Asunto de prueba',
  html: '<p>Hola</p>',
  text: 'Hola',
};
const API_KEY = 're_clave_super_secreta_123';

describe('ResendMailProvider', () => {
  const make = (fetchImpl: typeof fetch) =>
    new ResendMailProvider({ apiKey: API_KEY, from: 'Libro <avisos@ejemplo.com>', fetchImpl });

  it('envía por la API HTTP con la clave en la cabecera Authorization', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
    await make(fetchImpl as unknown as typeof fetch).send({
      ...MESSAGE,
      replyTo: 'visita@ejemplo.com',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Libro <avisos@ejemplo.com>',
      to: ['lectora@ejemplo.com'],
      subject: 'Asunto de prueba',
      html: '<p>Hola</p>',
      text: 'Hola',
      reply_to: 'visita@ejemplo.com',
    });
  });

  it('no incluye reply_to si no se indica', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await make(fetchImpl as unknown as typeof fetch).send(MESSAGE);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('reply_to');
  });

  it('convierte un rechazo del servicio en MailDeliveryError con el motivo y sin la clave', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('{"message":"The example.com domain is not verified."}', { status: 403 }),
    );
    const error = await make(fetchImpl as unknown as typeof fetch)
      .send(MESSAGE)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    const failure = error as MailDeliveryError;
    expect(failure.provider).toBe('resend');
    expect(failure.status).toBe(403);
    expect(failure.message).toContain('not verified');
    expect(failure.message).not.toContain(API_KEY);
  });

  it('convierte un fallo de red en MailDeliveryError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(make(fetchImpl as unknown as typeof fetch).send(MESSAGE)).rejects.toBeInstanceOf(
      MailDeliveryError,
    );
  });
});

describe('SmtpMailProvider / Gmail', () => {
  const fakeTransport = (sendMail: ReturnType<typeof vi.fn>) =>
    ({ sendMail }) as unknown as Transporter;

  it('envía con el remitente configurado y reply-to', async () => {
    const sendMail = vi.fn(async () => ({}));
    const provider = new SmtpMailProvider({
      host: 'smtp.ejemplo.com',
      port: 465,
      secure: true,
      user: 'u',
      pass: 'p',
      from: 'Libro <avisos@ejemplo.com>',
      transport: fakeTransport(sendMail),
    });
    await provider.send({ ...MESSAGE, replyTo: 'visita@ejemplo.com' });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Libro <avisos@ejemplo.com>',
      to: 'lectora@ejemplo.com',
      subject: 'Asunto de prueba',
      html: '<p>Hola</p>',
      text: 'Hola',
      replyTo: 'visita@ejemplo.com',
    });
  });

  it('un fallo de SMTP solo conserva el código, nunca credenciales ni texto del servidor', async () => {
    const sendMail = vi.fn(async () => {
      throw Object.assign(new Error('Invalid login: 535 user:contrasena-secreta rechazada'), {
        code: 'EAUTH',
      });
    });
    const provider = new SmtpMailProvider({
      host: 'h',
      port: 465,
      secure: true,
      user: 'u',
      pass: 'contrasena-secreta',
      from: 'a@b.co',
      transport: fakeTransport(sendMail),
    });
    const error = (await provider.send(MESSAGE).catch((e: unknown) => e)) as MailDeliveryError;
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error.message).toContain('EAUTH');
    expect(error.message).not.toContain('contrasena-secreta');
  });

  it('createGmailProvider usa smtp.gmail.com y por defecto remite desde la propia cuenta', () => {
    const provider = createGmailProvider({
      user: 'avisos@gmail.com',
      appPassword: 'abcdefghijklmnop',
    });
    expect(provider).toBeInstanceOf(SmtpMailProvider);
  });
});

describe('createMailProvider', () => {
  const base = {
    NODE_ENV: 'test' as const,
    MAIL_FROM: undefined,
    GMAIL_USER: undefined,
    GMAIL_APP_PASSWORD: undefined,
    RESEND_API_KEY: undefined,
  };

  it('elige el adaptador según MAIL_PROVIDER', () => {
    expect(createMailProvider({ ...base, MAIL_PROVIDER: 'memory' })).toBeInstanceOf(
      MemoryMailProvider,
    );
    expect(
      createMailProvider({
        ...base,
        MAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_12345678',
        MAIL_FROM: 'a@b.co',
      }),
    ).toBeInstanceOf(ResendMailProvider);
    expect(
      createMailProvider({
        ...base,
        MAIL_PROVIDER: 'gmail',
        GMAIL_USER: 'x@gmail.com',
        GMAIL_APP_PASSWORD: 'abcdefgh',
      }),
    ).toBeInstanceOf(SmtpMailProvider);
  });

  it('en desarrollo, el adaptador en memoria muestra en consola lo que "enviaría"', async () => {
    const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
    const info = vi.spyOn(logger, 'info');
    const provider = createMailProvider(
      { ...base, NODE_ENV: 'development', MAIL_PROVIDER: 'memory' },
      logger,
    );
    await provider.send(MESSAGE);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0]?.[1])).toContain('Hola');
  });

  it('en pruebas el adaptador en memoria no escribe nada en la consola', async () => {
    const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
    const info = vi.spyOn(logger, 'info');
    await createMailProvider({ ...base, MAIL_PROVIDER: 'memory' }, logger).send(MESSAGE);
    expect(info).not.toHaveBeenCalled();
  });
});
