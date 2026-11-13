import { newsletterStateSchema, notificationPreviewSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { User } from '../models/User.js';
import type { GoogleProfile, GoogleVerifier } from '../services/google.service.js';
import { staffWorld } from '../test-utils/admin.js';
import { PASSWORD, createUser, loginAgent } from '../test-utils/auth.js';
import { ADULT_CONSENT } from '../test-utils/consent.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

/**
 * La vista previa del aviso («Lo recibirían N lectores apuntados…») tiene que contar a quien se apuntó, sea cual sea el
 * camino por el que lo hizo. Estas pruebas crean la cuenta por cada camino real (HTTP, sin escribir en la base a mano) y
 * consultan la vista previa como administrador.
 */
const PREVIEW = '/api/admin/notifications/preview?kind=post';
const NEW_ACCOUNT = { name: 'Lola Pérez', email: 'lola@ejemplo.com', password: PASSWORD };

const recipients = async (admin: request.Agent) =>
  notificationPreviewSchema.parse((await admin.get(PREVIEW).expect(200)).body).recipients;

const stateOf = async (agent: request.Agent) =>
  newsletterStateSchema.parse((await agent.get('/api/me/newsletter').expect(200)).body);

function confirmTokenFrom(text: string): string {
  const match = /confirmar-novedades\?t=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error('El correo no trae el enlace de confirmación');
  return match[1];
}

describe('vista previa del aviso: cuenta a quien se apuntó por cada camino real', () => {
  it('registro con contraseña + casilla marcada: no cuenta hasta confirmar por el enlace, y luego sí', async () => {
    const world = await staffWorld();
    const agent = request.agent(world.app);
    await agent
      .post('/api/auth/register')
      .send({ ...NEW_ACCOUNT, ...ADULT_CONSENT, newsletter: true })
      .expect(201);
    expect((await stateOf(agent)).status).toBe('pending');
    expect(await recipients(world.admin)).toBe(0);

    await world.flush();
    const token = confirmTokenFrom(world.mail.sent[0]!.text);
    await request(world.app).post('/api/newsletter/confirm').send({ token }).expect(200);
    expect((await stateOf(agent)).status).toBe('subscribed');
    expect(await recipients(world.admin)).toBe(1);
  });

  it('Google (correo comprobado) con la casilla marcada: cuenta al instante', async () => {
    const profile: GoogleProfile = { email: 'gina@ejemplo.com', emailVerified: true, name: 'Gina' };
    const google: GoogleVerifier = { verify: async () => profile };
    const world = await staffWorld({ google });
    const agent = request.agent(world.app);
    await agent
      .post('/api/auth/google')
      .send({ credential: 'c'.repeat(40), profile: { ...ADULT_CONSENT, newsletter: true } })
      .expect(200);
    expect((await stateOf(agent)).status).toBe('subscribed');
    expect(await recipients(world.admin)).toBe(1);
  });

  it('desde la cuenta, con el correo ya comprobado: cuenta al instante', async () => {
    const world = await staffWorld();
    const user = await createUser({ email: 'verificada@ejemplo.com' });
    await User.updateOne(
      { _id: user._id },
      { $set: { birthYear: 1990, birthMonth: 6, emailVerifiedAt: new Date() } },
    );
    const agent = await loginAgent(world.app, 'verificada@ejemplo.com');
    await agent.put('/api/me/newsletter').send({ subscribed: true }).expect(200);
    expect(await recipients(world.admin)).toBe(1);
  });

  it('seguir cuenta después de apuntarse: iniciar sesión otra vez o volver a declarar no borra el alta', async () => {
    const world = await staffWorld();
    const agent = request.agent(world.app);
    await agent
      .post('/api/auth/register')
      .send({ ...NEW_ACCOUNT, ...ADULT_CONSENT, newsletter: true })
      .expect(201);
    await world.flush();
    const token = confirmTokenFrom(world.mail.sent[0]!.text);
    await request(world.app).post('/api/newsletter/confirm').send({ token }).expect(200);
    expect(await recipients(world.admin)).toBe(1);

    // Otra sesión de la misma cuenta, cerrar sesión, entrar de nuevo, y un cambio de contraseña.
    await agent.post('/api/auth/logout').expect(204);
    const again = request.agent(world.app);
    await again
      .post('/api/auth/login')
      .send({ email: NEW_ACCOUNT.email, password: PASSWORD })
      .expect(200);
    expect(await recipients(world.admin)).toBe(1);

    // Lo guardado en la base es lo que filtra la vista previa.
    const stored = await User.findOne({ email: NEW_ACCOUNT.email }).lean();
    expect(stored?.status).toBe('active');
    expect(stored?.newsletter).toMatchObject({ status: 'subscribed' });
  });

  it('una cuenta sin el campo `status` en la base: la cuenta dice «apuntada» y el conteo y el envío tienen que coincidir', async () => {
    // Mongoose rellena `status: 'active'` al leer un documento que no lo trae, así que la cuenta y el ingreso funcionan;
    // las consultas directas (el conteo) y las lecturas `lean` (el envío) no lo rellenan. Las tres deben coincidir.
    const world = await staffWorld();
    const user = await createUser({ email: 'antigua@ejemplo.com' });
    await User.collection.updateOne(
      { _id: user._id },
      {
        $unset: { status: '' },
        $set: {
          birthYear: 1990,
          birthMonth: 6,
          'newsletter.status': 'subscribed',
          'newsletter.subscribedAt': new Date(),
        },
      },
    );
    expect(
      await User.collection.countDocuments({ _id: user._id, status: { $exists: false } }),
    ).toBe(1);
    const agent = await loginAgent(world.app, 'antigua@ejemplo.com');
    expect((await stateOf(agent)).status).toBe('subscribed');
    expect(await recipients(world.admin)).toBe(1);
  });

  it('vuelve a declarar los consentimientos (needs_profile) marcando la casilla: cuenta', async () => {
    const world = await staffWorld();
    const user = await createUser({ email: 'vuelve@ejemplo.com' });
    await User.updateOne(
      { _id: user._id },
      { $set: { consentRequiredAt: new Date(), emailVerifiedAt: new Date() } },
    );
    const agent = request.agent(world.app);
    await agent
      .post('/api/auth/login')
      .send({
        email: 'vuelve@ejemplo.com',
        password: PASSWORD,
        profile: { ...ADULT_CONSENT, newsletter: true },
      })
      .expect(200);
    expect(await recipients(world.admin)).toBe(1);
  });
});
