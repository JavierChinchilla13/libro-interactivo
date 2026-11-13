import { LEGAL_VERSION, NEWSLETTER_MINOR_MESSAGE, newsletterStateSchema } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { User } from '../models/User.js';
import { createTestHarness } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

/**
 * Cuentas ANTERIORES al paso de edad: no tienen fecha de nacimiento guardada. Al apuntarse a las novedades se les pide
 * el mes y el año en ese momento, con las mismas reglas del registro: de 18 en adelante se guarda y se apunta; menores
 * de 18 (también menores de 16) no se guarda nada.
 */
const now = new Date();
const year = now.getUTCFullYear();
const month = now.getUTCMonth() + 1;
/** Mes de nacimiento de quien cumplió `years` años el mes pasado (la edad calculada es exacta). */
const birthAgo = (years: number) =>
  month > 1 ? { year: year - years, month: month - 1 } : { year: year - years - 1, month: 12 };

async function oldAccount(
  harness: ReturnType<typeof createTestHarness>,
  options: { verified?: boolean; birthYear?: number; email?: string } = {},
) {
  const email = options.email ?? 'antigua@ejemplo.com';
  const user = await createUser({ email });
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        ...(options.verified === false ? {} : { emailVerifiedAt: new Date() }),
        ...(options.birthYear ? { birthYear: options.birthYear, birthMonth: 6 } : {}),
      },
    },
  );
  return { user, agent: await loginAgent(harness.app, email) };
}
const raw = (id: unknown) => User.collection.findOne({ _id: id as never });
const stateOf = async (agent: Awaited<ReturnType<typeof loginAgent>>) =>
  newsletterStateSchema.parse((await agent.get('/api/me/newsletter').expect(200)).body);

describe('apuntarse una cuenta sin fecha de nacimiento (anterior al paso de edad)', () => {
  it('sin mandar la fecha: 400 que pide el mes y el año, y no se guarda nada', async () => {
    const harness = createTestHarness();
    const { user, agent } = await oldAccount(harness);
    const res = await agent.put('/api/me/newsletter').send({ subscribed: true });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/mes y año de nacimiento/);
    const doc = await raw(user._id);
    expect(doc?.['birthYear']).toBeUndefined();
    expect(doc?.['newsletter']).toBeUndefined();
  });

  it('18 o más: guarda mes y año con la fecha y la versión de la declaración, y la apunta (correo comprobado: al instante)', async () => {
    const harness = createTestHarness();
    const { user, agent } = await oldAccount(harness);
    const birth = birthAgo(30);
    const res = await agent.put('/api/me/newsletter').send({ subscribed: true, birth }).expect(200);
    expect(newsletterStateSchema.parse(res.body)).toMatchObject({
      status: 'subscribed',
      eligible: true,
      needsBirth: false,
      invitation: false,
    });
    const doc = await raw(user._id);
    expect(doc).toMatchObject({
      birthYear: birth.year,
      birthMonth: birth.month,
      guardianAuthorized: false,
      birthDeclaredVersion: LEGAL_VERSION,
    });
    expect(doc?.['birthDeclaredAt']).toBeInstanceOf(Date);
    // No es una aceptación de términos ni de privacidad: eso no se pidió aquí.
    expect(doc?.['termsAcceptedAt']).toBeUndefined();
    expect(doc?.['privacyConsentAt']).toBeUndefined();
    expect(doc?.['newsletter']).toMatchObject({ status: 'subscribed', source: 'account' });
  });

  it('18 o más con el correo sin comprobar: guarda la fecha y queda pendiente de confirmar por el enlace', async () => {
    const harness = createTestHarness();
    const { user, agent } = await oldAccount(harness, { verified: false });
    const res = await agent
      .put('/api/me/newsletter')
      .send({ subscribed: true, birth: birthAgo(40) })
      .expect(200);
    expect(newsletterStateSchema.parse(res.body).status).toBe('pending');
    expect((await raw(user._id))?.['birthYear']).toBeDefined();
    await harness.flush();
    expect(harness.mail.sent).toHaveLength(1);
  });

  it('cumplió 18 el mes pasado: pasa; cumple 18 este mes: todavía no, y no se guarda nada', async () => {
    const harness = createTestHarness();
    const { user, agent } = await oldAccount(harness);
    // Cumple 18 este mismo mes: la edad conservadora todavía cuenta 17.
    const res = await agent
      .put('/api/me/newsletter')
      .send({ subscribed: true, birth: { year: year - 18, month } });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(NEWSLETTER_MINOR_MESSAGE);
    expect((await raw(user._id))?.['birthYear']).toBeUndefined();
    await agent
      .put('/api/me/newsletter')
      .send({ subscribed: true, birth: birthAgo(18) })
      .expect(200);
  });

  it.each([
    ['de 16 a 17 años', 17],
    ['menor de 16', 12],
  ])(
    '%s: mensaje claro de mayores de 18 y NO se guarda nada (ni fecha, ni declaración, ni alta)',
    async (_name, age) => {
      const harness = createTestHarness();
      const { user, agent } = await oldAccount(harness);
      const res = await agent
        .put('/api/me/newsletter')
        .send({ subscribed: true, birth: birthAgo(age) });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe(NEWSLETTER_MINOR_MESSAGE);
      const doc = await raw(user._id);
      expect(doc?.['birthYear']).toBeUndefined();
      expect(doc?.['birthMonth']).toBeUndefined();
      expect(doc?.['birthDeclaredAt']).toBeUndefined();
      expect(doc?.['birthDeclaredVersion']).toBeUndefined();
      expect(doc?.['guardianAuthorized']).toBeUndefined();
      expect(doc?.['newsletter']).toBeUndefined();
      await harness.flush();
      expect(harness.mail.sent).toHaveLength(0);
      // Sigue sin fecha: puede volver a intentarlo (con su fecha real, si se equivocó).
      expect(await stateOf(agent)).toMatchObject({ eligible: true, needsBirth: true });
    },
  );

  it('fecha imposible (futura, de hace más de 120 años o mes 13): 400 y no se guarda nada', async () => {
    const harness = createTestHarness();
    const { user, agent } = await oldAccount(harness);
    for (const birth of [
      { year: year + 1, month: 1 },
      { year: year - 121, month: 6 },
    ]) {
      const res = await agent.put('/api/me/newsletter').send({ subscribed: true, birth });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/fecha de nacimiento/);
    }
    const badMonth = await agent
      .put('/api/me/newsletter')
      .send({ subscribed: true, birth: { year: 1990, month: 13 } });
    expect(badMonth.status).toBe(400);
    expect((await raw(user._id))?.['birthYear']).toBeUndefined();
  });

  it('una cuenta que ya tiene fecha ignora la que mande el cliente (no se puede reescribir la edad)', async () => {
    const harness = createTestHarness();
    const adult = await oldAccount(harness, { birthYear: 1985 });
    await adult.agent
      .put('/api/me/newsletter')
      .send({ subscribed: true, birth: { year: 1960, month: 1 } })
      .expect(200);
    const doc = await raw(adult.user._id);
    expect(doc?.['birthYear']).toBe(1985);
    expect(doc?.['birthDeclaredAt']).toBeUndefined();
    // Quien tiene guardada una fecha de menor no la cambia mandando otra.
    const minor = await oldAccount(harness, { email: 'menor@ejemplo.com', birthYear: year - 17 });
    const res = await minor.agent
      .put('/api/me/newsletter')
      .send({ subscribed: true, birth: birthAgo(40) });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(NEWSLETTER_MINOR_MESSAGE);
    expect((await raw(minor.user._id))?.['birthYear']).toBe(year - 17);
  });

  it('con «Sí» de la invitación (mismo camino) guarda la fecha y apunta; la baja después no la vuelve a pedir', async () => {
    const harness = createTestHarness();
    const { user, agent } = await oldAccount(harness);
    expect(await stateOf(agent)).toMatchObject({ needsBirth: true, invitation: true });
    await agent
      .put('/api/me/newsletter')
      .send({ subscribed: true, birth: birthAgo(25) })
      .expect(200);
    expect(await stateOf(agent)).toMatchObject({ status: 'subscribed', invitation: false });
    const off = await agent.put('/api/me/newsletter').send({ subscribed: false }).expect(200);
    expect(newsletterStateSchema.parse(off.body)).toMatchObject({
      status: 'none',
      needsBirth: false,
      invitation: false,
    });
    // Darse de baja no borra la fecha ya declarada.
    expect((await raw(user._id))?.['birthYear']).toBeDefined();
  });

  it('darse de baja no necesita fecha', async () => {
    const harness = createTestHarness();
    const { agent } = await oldAccount(harness);
    await agent.put('/api/me/newsletter').send({ subscribed: false }).expect(200);
  });
});
