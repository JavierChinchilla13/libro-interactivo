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

/** Un lector adulto con fecha de nacimiento guardada, con o sin el correo comprobado, ya con sesión. */
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
  it('sin la casilla no apunta a nadie y da por respondida la invitación (ya dijo que no)', async () => {
    const harness = createTestHarness();
    const agent = request.agent(harness.app);
    await agent
      .post('/api/auth/register')
      .send({ ...NEW_ACCOUNT, ...ADULT_CONSENT })
      .expect(201);
    expect(await stateOf(agent)).toEqual({
      status: 'none',
      eligible: true,
      needsBirth: false,
      invitation: false,
    });
    const stored = await User.findOne({ email: 'lola@ejemplo.com' }).lean();
    expect(stored?.newsletter?.invitationAnsweredAt).toBeInstanceOf(Date);
    expect(stored?.newsletter?.status).toBeUndefined();
    await harness.flush();
    expect(harness.mail.sent).toHaveLength(0);
  });

  it('de 16 a 17 años no ve la casilla: no queda respondida y la invitación sale al cumplir 18', async () => {
    const harness = createTestHarness();
    const agent = request.agent(harness.app);
    await agent
      .post('/api/auth/register')
      .send({ ...NEW_ACCOUNT, ...MINOR })
      .expect(201);
    const stored = await User.findOne({ email: 'lola@ejemplo.com' }).lean();
    expect(stored?.newsletter?.invitationAnsweredAt).toBeUndefined();
    expect(await stateOf(agent)).toMatchObject({ eligible: false, invitation: false });
    // Con el tiempo cumple 18: ahora sí puede apuntarse y la invitación le sale (nunca vio la casilla).
    await User.updateOne({ _id: stored?._id }, { $set: { birthYear: 1990 } });
    expect(await stateOf(agent)).toEqual({
      status: 'none',
      eligible: true,
      needsBirth: false,
      invitation: true,
    });
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
    // Confirmar los avisos NO comprueba el correo de la cuenta (no le quita al dueño real la vía de recuperarla).
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

  it('con Google (correo comprobado) queda apuntado al instante, sin correo de confirmación', async () => {
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

  it('con Google y la casilla sin marcar: no se apunta y la invitación queda respondida', async () => {
    const profile: GoogleProfile = { email: 'gil@ejemplo.com', emailVerified: true, name: 'Gil' };
    const google: GoogleVerifier = { verify: async () => profile };
    const harness = createTestHarness({ google });
    const agent = request.agent(harness.app);
    // Primer paso: sin perfil todavía no hay cuenta ni respuesta.
    const first = await agent
      .post('/api/auth/google')
      .send({ credential: 'c'.repeat(40) })
      .expect(200);
    expect(first.body.status).toBe('needs_profile');
    expect(await User.countDocuments()).toBe(0);
    // Segundo paso: vio la casilla (adulto) y no la marcó.
    await agent
      .post('/api/auth/google')
      .send({ credential: 'c'.repeat(40), profile: ADULT_CONSENT })
      .expect(200);
    expect(await stateOf(agent)).toEqual({
      status: 'none',
      eligible: true,
      needsBirth: false,
      invitation: false,
    });
    expect(
      (await User.findOne({ email: 'gil@ejemplo.com' }).lean())?.newsletter?.invitationAnsweredAt,
    ).toBeInstanceOf(Date);
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

  it('al volver a declarar sin marcar la casilla queda respondida; un ingreso normal no la responde', async () => {
    const harness = createTestHarness();
    const user = await createUser({ email: 'vuelve@ejemplo.com' });
    await User.updateOne(
      { _id: user._id },
      { $set: { consentRequiredAt: new Date(), emailVerifiedAt: new Date() } },
    );
    const agent = request.agent(harness.app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'vuelve@ejemplo.com', password: PASSWORD, profile: ADULT_CONSENT })
      .expect(200);
    expect(await stateOf(agent)).toMatchObject({ status: 'none', invitation: false });
    expect((await User.findById(user._id).lean())?.newsletter?.invitationAnsweredAt).toBeInstanceOf(
      Date,
    );

    // Una cuenta que entra sin declarar nada (nunca vio la casilla) sigue recibiendo la invitación.
    await adult(harness, { email: 'antigua@ejemplo.com' });
    const old = await loginAgent(harness.app, 'antigua@ejemplo.com');
    expect((await stateOf(old)).invitation).toBe(true);
  });
});

describe('la casilla de la cuenta', () => {
  it('correo comprobado: apuntarse es inmediato y darse de baja también', async () => {
    const harness = createTestHarness();
    const { agent } = await adult(harness, { verified: true });
    expect(await stateOf(agent)).toEqual({
      status: 'none',
      eligible: true,
      needsBirth: false,
      invitation: true,
    });
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

  it('quien se sabe menor de 18 no puede apuntarse (el servidor decide)', async () => {
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

describe('invitación única del panel', () => {
  const DECLINE = { answer: 'declined' };
  const answeredAt = async (id: unknown) =>
    (await User.findById(id).lean())?.newsletter?.invitationAnsweredAt;

  it('una adulta que nunca respondió la ve; «No, gracias» no la apunta y no vuelve a salir', async () => {
    const harness = createTestHarness();
    const { agent, user } = await adult(harness, { verified: true });
    expect((await stateOf(agent)).invitation).toBe(true);

    const res = await agent.put('/api/me/newsletter/invitation').send(DECLINE).expect(200);
    expect(newsletterStateSchema.parse(res.body)).toEqual({
      status: 'none',
      eligible: true,
      needsBirth: false,
      invitation: false,
    });
    expect(await answeredAt(user._id)).toBeInstanceOf(Date);
    // Sigue sin estar apuntado y sin recibir nada.
    expect((await User.findById(user._id).lean())?.newsletter?.status).toBeUndefined();
    await harness.flush();
    expect(harness.mail.sent).toHaveLength(0);
    // Ni en la siguiente visita ni en otra sesión.
    expect((await stateOf(agent)).invitation).toBe(false);
    const other = await loginAgent(harness.app, 'lectora@ejemplo.com');
    expect((await stateOf(other)).invitation).toBe(false);
  });

  it('responder dos veces es inocuo y conserva la primera fecha', async () => {
    const harness = createTestHarness();
    const { agent, user } = await adult(harness);
    await agent.put('/api/me/newsletter/invitation').send(DECLINE).expect(200);
    const first = await answeredAt(user._id);
    await agent.put('/api/me/newsletter/invitation').send(DECLINE).expect(200);
    expect(await answeredAt(user._id)).toEqual(first);
  });

  it('«No, gracias» y luego apuntarse desde la cuenta: funciona, y al darse de baja no vuelve a salir', async () => {
    const harness = createTestHarness();
    const { agent, user } = await adult(harness, { verified: true });
    await agent.put('/api/me/newsletter/invitation').send(DECLINE).expect(200);
    const first = await answeredAt(user._id);
    const on = await agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    expect(newsletterStateSchema.parse(on.body).status).toBe('subscribed');
    expect(await answeredAt(user._id)).toEqual(first);
    const off = await agent.put('/api/me/newsletter').send({ subscribed: false }).expect(200);
    expect(newsletterStateSchema.parse(off.body)).toMatchObject({
      status: 'none',
      invitation: false,
    });
  });

  it('«Sí» con el correo comprobado: queda apuntado al instante y la invitación se da por respondida', async () => {
    const harness = createTestHarness();
    const { agent, user } = await adult(harness, { verified: true });
    const res = await agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    expect(newsletterStateSchema.parse(res.body)).toMatchObject({
      status: 'subscribed',
      invitation: false,
    });
    expect(await answeredAt(user._id)).toBeInstanceOf(Date);
    expect((await User.findById(user._id).lean())?.newsletter?.source).toBe('account');
  });

  it('«Sí» con el correo sin comprobar: doble confirmación (pendiente y llega el enlace) y no se vuelve a ofrecer', async () => {
    const harness = createTestHarness();
    const { agent } = await adult(harness);
    const res = await agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    expect(newsletterStateSchema.parse(res.body)).toMatchObject({
      status: 'pending',
      invitation: false,
    });
    await harness.flush();
    expect(harness.mail.sent).toHaveLength(1);
    // Si cancela el alta pendiente, tampoco se le vuelve a preguntar.
    await agent.put('/api/me/newsletter').send({ subscribed: false }).expect(200);
    expect((await stateOf(agent)).invitation).toBe(false);
  });

  it('quien se apuntó por otro camino (al registrarse) no la ve', async () => {
    const harness = createTestHarness();
    const agent = request.agent(harness.app);
    await agent
      .post('/api/auth/register')
      .send({ ...NEW_ACCOUNT, ...ADULT_CONSENT, newsletter: true })
      .expect(201);
    expect(await stateOf(agent)).toMatchObject({ status: 'pending', invitation: false });
  });

  it('quien ya está apuntado o ya se dio de baja (cuentas anteriores a la invitación) no la ve', async () => {
    const harness = createTestHarness();
    const a = await adult(harness, { verified: true, email: 'apuntada@ejemplo.com' });
    await User.updateOne(
      { _id: a.user._id },
      { $set: { 'newsletter.status': 'subscribed', 'newsletter.subscribedAt': new Date() } },
    );
    expect(await stateOf(a.agent)).toMatchObject({ status: 'subscribed', invitation: false });

    const b = await adult(harness, { verified: true, email: 'baja@ejemplo.com' });
    await User.updateOne(
      { _id: b.user._id },
      { $set: { 'newsletter.status': 'unsubscribed', 'newsletter.unsubscribedVia': 'link' } },
    );
    expect(await stateOf(b.agent)).toMatchObject({ status: 'none', invitation: false });
  });

  it('quien se sabe menor de 18 no la ve y «No, gracias» no le guarda nada', async () => {
    const harness = createTestHarness();
    const minor = await adult(harness, {
      email: 'menor@ejemplo.com',
      birthYear: new Date().getUTCFullYear() - 17,
    });
    expect(await stateOf(minor.agent)).toMatchObject({ eligible: false, invitation: false });
    await minor.agent.put('/api/me/newsletter/invitation').send(DECLINE).expect(200);
    expect(await answeredAt(minor.user._id)).toBeUndefined();
  });

  it('una cuenta anterior, sin fecha de nacimiento, sí la ve; «No, gracias» la da por respondida sin guardar ninguna fecha', async () => {
    const harness = createTestHarness();
    const noBirth = await createUser({ email: 'sinfecha@ejemplo.com' });
    const agent = await loginAgent(harness.app, 'sinfecha@ejemplo.com');
    expect(await stateOf(agent)).toEqual({
      status: 'none',
      eligible: true,
      needsBirth: true,
      invitation: true,
    });
    await agent.put('/api/me/newsletter/invitation').send(DECLINE).expect(200);
    expect(await answeredAt(noBirth._id)).toBeInstanceOf(Date);
    expect((await stateOf(agent)).invitation).toBe(false);
    const stored = await User.findById(noBirth._id).lean();
    expect(stored?.birthYear).toBeUndefined();
    expect(stored?.birthDeclaredAt).toBeUndefined();
  });

  it('pide sesión, valida el cuerpo y sigue protegida por el mismo origen', async () => {
    const harness = createTestHarness();
    expect(
      (await request(harness.app).put('/api/me/newsletter/invitation').send(DECLINE)).status,
    ).toBe(401);
    const { agent, user } = await adult(harness, { verified: true });
    for (const body of [{}, { answer: 'accepted' }, { answer: true }]) {
      expect((await agent.put('/api/me/newsletter/invitation').send(body)).status).toBe(400);
    }
    const foreign = await agent
      .put('/api/me/newsletter/invitation')
      .set('Origin', 'https://otro-sitio.example')
      .send(DECLINE);
    expect(foreign.status).toBe(403);
    expect(await answeredAt(user._id)).toBeUndefined();
  });
});
