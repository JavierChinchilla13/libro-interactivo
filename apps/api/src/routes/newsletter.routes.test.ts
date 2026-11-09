import { NEWSLETTER_MINOR_MESSAGE, apiErrorSchema, newsletterStateSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { signSvix } from '../lib/svix.js';
import { createUnsubscribeToken } from '../lib/unsubscribeToken.js';
import { User } from '../models/User.js';
import type { GoogleProfile, GoogleVerifier } from '../services/google.service.js';
import { createTestHarness } from '../test-utils/app.js';
import { PASSWORD, createUser, loginAgent } from '../test-utils/auth.js';
import { ADULT_CONSENT, consentFor } from '../test-utils/consent.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

/** El valor por defecto de desarrollo y pruebas (ver `DEV_DEFAULTS`). */
const UNSUB_SECRET = 'solo-para-desarrollo-enlaces-de-baja-no-usar-en-produccion-5432';
const WEBHOOK_SECRET = `whsec_${Buffer.from('clave-de-prueba-del-webhook-1234').toString('base64')}`;
const ORIGIN = 'http://localhost:5173';
const NEW_ACCOUNT = { name: 'Lola Pérez', email: 'lola@ejemplo.com', password: PASSWORD };
const MINOR = consentFor(new Date().getUTCFullYear() - 17, 1, 'minor_with_guardian');

function confirmTokenFrom(text: string): string {
  const match = /confirmar-novedades\?t=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error('El correo no trae el enlace de confirmación');
  return match[1];
}

/** Una lectora adulta con fecha de nacimiento guardada, con o sin el correo comprobado, ya con sesión. */
async function adult(
  harness: ReturnType<typeof createTestHarness>,
  options: { verified?: boolean; email?: string; birthYear?: number } = {},
) {
  const email = options.email ?? 'lectora@ejemplo.com';
  const user = await createUser({ email });
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        birthYear: options.birthYear ?? 1990,
        birthMonth: 6,
        ...(options.verified ? { emailVerifiedAt: new Date() } : {}),
      },
    },
  );
  return { user, agent: await loginAgent(harness.app, email) };
}

const stateOf = async (agent: request.Agent) =>
  newsletterStateSchema.parse((await agent.get('/api/me/newsletter').expect(200)).body);

describe('alta desde el registro', () => {
  it('sin la casilla no apunta a nadie', async () => {
    const harness = createTestHarness();
    const agent = request.agent(harness.app);
    await agent
      .post('/api/auth/register')
      .send({ ...NEW_ACCOUNT, ...ADULT_CONSENT })
      .expect(201);
    expect(await stateOf(agent)).toEqual({ status: 'none', eligible: true });
    await harness.flush();
    expect(harness.mail.sent).toHaveLength(0);
  });

  it('con la casilla y el correo sin comprobar: queda pendiente y llega un enlace de un solo uso', async () => {
    const harness = createTestHarness();
    const agent = request.agent(harness.app);
    await agent
      .post('/api/auth/register')
      .send({ ...NEW_ACCOUNT, ...ADULT_CONSENT, newsletter: true })
      .expect(201);
    const pending = await stateOf(agent);
    expect(pending.status).toBe('pending');
    expect(pending.pendingSince).toBeDefined();
    await harness.flush();
    expect(harness.mail.sent).toHaveLength(1);
    const mail = harness.mail.sent[0]!;
    expect(mail.to).toBe('lola@ejemplo.com');
    expect(mail.subject).toMatch(/Confirma tus correos de novedades/);

    // Confirmar sin sesión (desde el correo).
    const token = confirmTokenFrom(mail.text);
    const confirmed = await request(harness.app)
      .post('/api/newsletter/confirm')
      .send({ token })
      .expect(200);
    expect(newsletterStateSchema.parse(confirmed.body).status).toBe('subscribed');
    expect((await stateOf(agent)).status).toBe('subscribed');

    // Un solo uso.
    const again = await request(harness.app).post('/api/newsletter/confirm').send({ token });
    expect(again.status).toBe(400);
    expect(apiErrorSchema.parse(again.body).error.code).toBe('TOKEN_INVALID');

    // Lo guardado: fecha, versión y origen; solo la huella del enlace, que se borra al confirmar.
    const stored = await User.findOne({ email: 'lola@ejemplo.com' }).lean();
    expect(stored?.newsletter).toMatchObject({ status: 'subscribed', source: 'register' });
    expect(stored?.newsletter?.version).toMatch(/^\d{4}-\d{2}-\d+$/);
    expect(stored?.newsletter?.confirmTokenHash).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(token);
    // Confirmar los avisos NO comprueba el correo de la cuenta (no le quita a la dueña real la vía de recuperarla).
    expect(stored?.emailVerifiedAt).toBeUndefined();
  });

  it('una persona de 16 o 17 años que marca la casilla: 400 y no se crea la cuenta', async () => {
    const harness = createTestHarness();
    const res = await request(harness.app)
      .post('/api/auth/register')
      .send({ ...NEW_ACCOUNT, ...MINOR, newsletter: true });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(NEWSLETTER_MINOR_MESSAGE);
    expect(await User.countDocuments()).toBe(0);
  });

  it('con Google (correo comprobado) queda apuntada al instante, sin correo de confirmación', async () => {
    const profile: GoogleProfile = {
      email: 'gina@ejemplo.com',
      emailVerified: true,
      name: 'Gina',
    };
    const google: GoogleVerifier = { verify: async () => profile };
    const harness = createTestHarness({ google });
    const agent = request.agent(harness.app);
    await agent
      .post('/api/auth/google')
      .send({ credential: 'c'.repeat(40), profile: { ...ADULT_CONSENT, newsletter: true } })
      .expect(200);
    expect((await stateOf(agent)).status).toBe('subscribed');
    await harness.flush();
    expect(harness.mail.sent).toHaveLength(0);
    expect((await User.findOne({ email: 'gina@ejemplo.com' }).lean())?.newsletter?.source).toBe(
      'google',
    );
  });
});

describe('alta al volver a declarar los consentimientos en el ingreso', () => {
  it('needs_profile con la casilla marcada: apunta después de entrar (origen «login»)', async () => {
    const harness = createTestHarness();
    const user = await createUser({ email: 'vuelve@ejemplo.com' });
    await User.updateOne(
      { _id: user._id },
      { $set: { consentRequiredAt: new Date(), emailVerifiedAt: new Date() } },
    );
    const agent = request.agent(harness.app);
    const first = await agent
      .post('/api/auth/login')
      .send({ email: 'vuelve@ejemplo.com', password: PASSWORD })
      .expect(200);
    expect(first.body.status).toBe('needs_profile');
    await agent
      .post('/api/auth/login')
      .send({
        email: 'vuelve@ejemplo.com',
        password: PASSWORD,
        profile: { ...ADULT_CONSENT, newsletter: true },
      })
      .expect(200);
    expect((await stateOf(agent)).status).toBe('subscribed');
    expect((await User.findById(user._id).lean())?.newsletter?.source).toBe('login');
  });
});

describe('la casilla de la cuenta', () => {
  it('correo comprobado: apuntarse es inmediato y darse de baja también', async () => {
    const harness = createTestHarness();
    const { agent } = await adult(harness, { verified: true });
    expect(await stateOf(agent)).toEqual({ status: 'none', eligible: true });
    const on = await agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    expect(newsletterStateSchema.parse(on.body).status).toBe('subscribed');
    const off = await agent.put('/api/me/newsletter').send({ subscribed: false }).expect(200);
    expect(newsletterStateSchema.parse(off.body).status).toBe('none');
    const stored = await User.findOne({ email: 'lectora@ejemplo.com' }).lean();
    expect(stored?.newsletter).toMatchObject({
      status: 'unsubscribed',
      unsubscribedVia: 'account',
    });
  });

  it('correo sin comprobar: queda pendiente y no reenvía el enlace si se vuelve a pedir enseguida', async () => {
    const harness = createTestHarness();
    const { agent } = await adult(harness);
    await agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    await agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    expect((await stateOf(agent)).status).toBe('pending');
    await harness.flush();
    expect(harness.mail.sent).toHaveLength(1);
    // Darse de baja con el alta pendiente la cancela (y el enlace ya no sirve).
    const token = confirmTokenFrom(harness.mail.sent[0]!.text);
    await agent.put('/api/me/newsletter').send({ subscribed: false }).expect(200);
    expect((await stateOf(agent)).status).toBe('none');
    expect(
      (await request(harness.app).post('/api/newsletter/confirm').send({ token })).status,
    ).toBe(400);
  });

  it('un enlace de confirmación caducado no sirve', async () => {
    const harness = createTestHarness();
    const { agent, user } = await adult(harness);
    await agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    await harness.flush();
    const token = confirmTokenFrom(harness.mail.sent[0]!.text);
    await User.updateOne(
      { _id: user._id },
      { $set: { 'newsletter.confirmTokenExpiresAt': new Date(Date.now() - 1000) } },
    );
    expect(
      (await request(harness.app).post('/api/newsletter/confirm').send({ token })).status,
    ).toBe(400);
    expect((await stateOf(agent)).status).toBe('pending');
  });

  it('menores y cuentas sin fecha de nacimiento no pueden apuntarse (el servidor decide)', async () => {
    const harness = createTestHarness();
    const minor = await adult(harness, {
      email: 'menor@ejemplo.com',
      birthYear: new Date().getUTCFullYear() - 17,
      verified: true,
    });
    expect((await stateOf(minor.agent)).eligible).toBe(false);
    const res = await minor.agent.put('/api/me/newsletter').send({ subscribed: true });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(NEWSLETTER_MINOR_MESSAGE);

    await createUser({ email: 'sinfecha@ejemplo.com' });
    const noBirth = await loginAgent(harness.app, 'sinfecha@ejemplo.com');
    expect((await stateOf(noBirth)).eligible).toBe(false);
    const res2 = await noBirth.put('/api/me/newsletter').send({ subscribed: true });
    expect(res2.status).toBe(400);
    expect(res2.body.error.message).toMatch(/fecha de nacimiento/);
  });

  it('pide sesión, valida el cuerpo y sigue protegida por el mismo origen', async () => {
    const harness = createTestHarness();
    expect((await request(harness.app).get('/api/me/newsletter')).status).toBe(401);
    const { agent } = await adult(harness, { verified: true });
    expect((await agent.put('/api/me/newsletter').send({ subscribed: 'sí' })).status).toBe(400);
    const foreign = await agent
      .put('/api/me/newsletter')
      .set('Origin', 'https://otro-sitio.example')
      .send({ subscribed: true });
    expect(foreign.status).toBe(403);
  });
});

describe('baja sin sesión con el token del correo', () => {
  async function subscribed(harness: ReturnType<typeof createTestHarness>) {
    const { agent, user } = await adult(harness, { verified: true });
    await agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    return { agent, user, token: createUnsubscribeToken(String(user._id), UNSUB_SECRET) };
  }

  it('botón de baja del cliente de correo (RFC 8058): POST sin sesión, desde otro origen, con el cuerpo de formulario', async () => {
    const harness = createTestHarness();
    const { agent, user, token } = await subscribed(harness);
    const res = await request(harness.app)
      .post(`/api/newsletter/unsubscribe?t=${token}`)
      .set('Origin', 'https://mail.google.com')
      .type('form')
      .send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect((await stateOf(agent)).status).toBe('none');
    expect((await User.findById(user._id).lean())?.newsletter?.unsubscribedVia).toBe('header');
    // Idempotente.
    expect((await request(harness.app).post(`/api/newsletter/unsubscribe?t=${token}`)).status).toBe(
      200,
    );
  });

  it('enlace visible (página /baja): queda anotado como «link»', async () => {
    const harness = createTestHarness();
    const { user, token } = await subscribed(harness);
    await request(harness.app)
      .post(`/api/newsletter/unsubscribe?t=${token}&origen=enlace`)
      .set('Origin', ORIGIN)
      .expect(200);
    expect((await User.findById(user._id).lean())?.newsletter?.unsubscribedVia).toBe('link');
  });

  it('un token falso o de otra firma responde igual y no cambia nada; un GET nunca da de baja', async () => {
    const harness = createTestHarness();
    const { agent, user } = await subscribed(harness);
    const forged = createUnsubscribeToken(String(user._id), `${UNSUB_SECRET}-otra`);
    for (const t of [forged, 'basura', `${forged}x`]) {
      const res = await request(harness.app).post(
        `/api/newsletter/unsubscribe?t=${encodeURIComponent(t)}`,
      );
      expect(res.status, t).toBe(200);
      expect(res.body).toEqual({ message: 'Listo' });
    }
    const real = createUnsubscribeToken(String(user._id), UNSUB_SECRET);
    expect((await request(harness.app).get(`/api/newsletter/unsubscribe?t=${real}`)).status).toBe(
      404,
    );
    expect((await stateOf(agent)).status).toBe('subscribed');
    // Sin token: 400.
    expect((await request(harness.app).post('/api/newsletter/unsubscribe')).status).toBe(400);
  });

  it('tiene su propio límite por IP', async () => {
    const harness = createTestHarness({
      limits: { newsletterPublic: { windowMs: 60_000, limit: 2 } },
    });
    for (let i = 0; i < 2; i += 1) {
      expect((await request(harness.app).post('/api/newsletter/unsubscribe?t=x')).status).toBe(200);
    }
    expect((await request(harness.app).post('/api/newsletter/unsubscribe?t=x')).status).toBe(429);
  });
});

describe('webhook de Resend (rebotes y quejas)', () => {
  const nowTs = () => String(Math.floor(Date.now() / 1000));
  function signed(body: object, options: { ts?: string; secret?: string } = {}) {
    const raw = JSON.stringify(body);
    const ts = options.ts ?? nowTs();
    const id = `msg_${Math.random().toString(36).slice(2)}`;
    const sig = signSvix(options.secret ?? WEBHOOK_SECRET, id, ts, raw);
    return { raw, headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` } };
  }
  const send = (
    app: ReturnType<typeof createTestHarness>['app'],
    event: ReturnType<typeof signed>,
  ) =>
    request(app)
      .post('/api/webhooks/resend')
      .set(event.headers)
      .set('Content-Type', 'application/json')
      .send(event.raw);

  it('sin secreto configurado no existe (404)', async () => {
    const harness = createTestHarness();
    expect((await send(harness.app, signed({ type: 'email.bounced' }))).status).toBe(404);
  });

  it('un rebote permanente y una queja de spam dan de baja; un rebote temporal no', async () => {
    const harness = createTestHarness({ env: { RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET } });
    const a = await adult(harness, { verified: true, email: 'rebota@ejemplo.com' });
    const b = await adult(harness, { verified: true, email: 'queja@ejemplo.com' });
    const c = await adult(harness, { verified: true, email: 'temporal@ejemplo.com' });
    for (const who of [a, b, c]) {
      await who.agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    }
    const bounce = (to: string, type: string) =>
      signed({ type: 'email.bounced', data: { to: [to], bounce: { type } } });
    expect((await send(harness.app, bounce('REBOTA@ejemplo.com', 'Permanent'))).status).toBe(204);
    expect(
      (
        await send(
          harness.app,
          signed({ type: 'email.complained', data: { to: ['queja@ejemplo.com'] } }),
        )
      ).status,
    ).toBe(204);
    expect((await send(harness.app, bounce('temporal@ejemplo.com', 'Temporary'))).status).toBe(204);
    expect((await send(harness.app, bounce('nadie@ejemplo.com', 'Permanent'))).status).toBe(204);

    expect((await User.findById(a.user._id).lean())?.newsletter).toMatchObject({
      status: 'unsubscribed',
      unsubscribedVia: 'bounce',
    });
    expect((await User.findById(b.user._id).lean())?.newsletter?.unsubscribedVia).toBe('complaint');
    expect((await User.findById(c.user._id).lean())?.newsletter?.status).toBe('subscribed');
  });

  it('firma inválida, vieja o de otro secreto: 400 y no cambia nada', async () => {
    const harness = createTestHarness({ env: { RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET } });
    const a = await adult(harness, { verified: true, email: 'rebota@ejemplo.com' });
    await a.agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    const body = { type: 'email.complained', data: { to: ['rebota@ejemplo.com'] } };
    const other = `whsec_${Buffer.from('otra-clave-del-webhook-56789012').toString('base64')}`;
    const old = String(Math.floor(Date.now() / 1000) - 10 * 60);
    for (const event of [signed(body, { secret: other }), signed(body, { ts: old })]) {
      expect((await send(harness.app, event)).status).toBe(400);
    }
    const tampered = signed(body);
    tampered.raw = tampered.raw.replace('complained', 'bounced');
    expect((await send(harness.app, tampered)).status).toBe(400);
    expect((await User.findById(a.user._id).lean())?.newsletter?.status).toBe('subscribed');
  });
});
