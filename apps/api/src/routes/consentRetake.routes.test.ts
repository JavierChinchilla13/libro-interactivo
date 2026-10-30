import { LEGAL_VERSION, googleLoginResponseSchema, loginResponseSchema } from '@libro/shared';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../lib/cookies.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import type { GoogleProfile, GoogleVerifier } from '../services/google.service.js';
import { hashPassword } from '../services/password.service.js';
import { createTestHarness, createTestClock } from '../test-utils/app.js';
import { NEW_PASSWORD, PASSWORD, resetTokenFrom, setCookies } from '../test-utils/auth.js';
import { ADULT_CONSENT, NOW, consentFor } from '../test-utils/consent.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const EMAIL = 'lola@ejemplo.com';
const CREDENTIAL = 'a'.repeat(40);
const GOOGLE: GoogleProfile = { email: EMAIL, emailVerified: true, name: 'Lola Pérez' };
const google: GoogleVerifier = {
  verify: async (credential) => (credential === CREDENTIAL ? GOOGLE : null),
};

/** Lo que dejó escrito quien creó la cuenta (otra persona, con el correo de la dueña). */
const DECLARED_BY_OTHER = {
  birthYear: 1980,
  birthMonth: 2,
  guardianAuthorized: false,
  termsAcceptedAt: new Date('2026-10-01T00:00:00Z'),
  privacyConsentAt: new Date('2026-10-01T00:00:00Z'),
  termsVersion: 'vieja',
};

async function makeUser(over: Record<string, unknown> = {}) {
  return User.create({
    email: EMAIL,
    emailNormalized: EMAIL,
    name: 'Lola Pérez',
    passwordHash: await hashPassword(PASSWORD),
    role: 'USER',
    ...over,
  });
}

const harness = () => createTestHarness({ google, clock: createTestClock(NOW) });
type App = ReturnType<typeof harness>['app'];

const login = (app: App, body: object = {}) =>
  request(app)
    .post('/api/auth/login')
    .send({ email: EMAIL, password: PASSWORD, ...body });
const loginNew = (app: App, body: object = {}) => login(app, { password: NEW_PASSWORD, ...body });
const googleLogin = (app: App, body: object = {}) =>
  request(app)
    .post('/api/auth/google')
    .send({ credential: CREDENTIAL, ...body });

/** Pide el enlace, lo canjea y devuelve el estado de la cuenta. */
async function resetPassword(h: ReturnType<typeof harness>) {
  await request(h.app).post('/api/auth/forgot-password').send({ email: EMAIL }).expect(200);
  await h.flush();
  const token = resetTokenFrom(h.mail.sent.at(-1)!.text);
  await request(h.app)
    .post('/api/auth/reset-password')
    .send({ token, newPassword: NEW_PASSWORD, newPasswordConfirm: NEW_PASSWORD })
    .expect(200);
  return User.findOne({ emailNormalized: EMAIL }).lean();
}

const hasSession = (res: request.Response) =>
  setCookies(res).some((c) => c.startsWith(`${ACCESS_COOKIE}=`)) ||
  setCookies(res).some((c) => c.startsWith(`${REFRESH_COOKIE}=`));

afterEach(() => vi.restoreAllMocks());

describe('restablecer contraseña · cuenta con la edad y los consentimientos de otra persona', () => {
  it('borra lo declarado, marca la cuenta y comprueba el correo', async () => {
    const h = harness();
    await makeUser(DECLARED_BY_OTHER);
    const after = await resetPassword(h);

    expect(after?.emailVerifiedAt).toEqual(NOW);
    expect(after?.consentRequiredAt).toEqual(NOW);
    for (const key of [
      'birthYear',
      'birthMonth',
      'guardianAuthorized',
      'termsAcceptedAt',
      'privacyConsentAt',
      'termsVersion',
    ] as const) {
      expect(after?.[key], key).toBeUndefined();
    }
  });

  it('en el siguiente ingreso con contraseña se vuelven a pedir: sin ellos no hay sesión', async () => {
    const h = harness();
    await makeUser(DECLARED_BY_OTHER);
    await resetPassword(h);

    const first = await loginNew(h.app).expect(200);
    expect(loginResponseSchema.parse(first.body)).toEqual({
      status: 'needs_profile',
      name: 'Lola Pérez',
      email: EMAIL,
    });
    expect(hasSession(first)).toBe(false);
    expect(await RefreshToken.countDocuments({})).toBe(0);
    expect((await User.findOne({}).lean())?.consentRequiredAt).toEqual(NOW);
  });

  it('con la edad y los consentimientos entra, queda guardado lo que ella declaró y la marca se quita', async () => {
    const h = harness();
    await makeUser(DECLARED_BY_OTHER);
    await resetPassword(h);

    const second = await loginNew(h.app, { profile: consentFor(2010, 1, 'minor_with_guardian') });
    expect(second.status).toBe(200);
    expect(loginResponseSchema.parse(second.body).status).toBe('ok');
    expect(hasSession(second)).toBe(true);

    const user = await User.findOne({}).lean();
    expect(user).toMatchObject({
      birthYear: 2010,
      birthMonth: 1,
      guardianAuthorized: true,
      termsVersion: LEGAL_VERSION,
    });
    expect(user?.termsAcceptedAt).toEqual(NOW);
    expect(user?.privacyConsentAt).toEqual(NOW);
    expect(user?.consentRequiredAt).toBeUndefined();

    // Ya no se vuelve a pedir.
    const third = await loginNew(h.app).expect(200);
    expect(loginResponseSchema.parse(third.body).status).toBe('ok');
  });

  it('una contraseña equivocada sigue dando el mismo error y no revela la marca', async () => {
    const h = harness();
    await makeUser(DECLARED_BY_OTHER);
    await resetPassword(h);
    const res = await login(h.app, { password: 'otra-contraseña-que-no-es' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
  });

  it('si no alcanza la edad mínima no entra y la marca se queda', async () => {
    const h = harness();
    await makeUser(DECLARED_BY_OTHER);
    await resetPassword(h);
    const res = await loginNew(h.app, { profile: consentFor(2015, 5, 'adult') });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AGE_RESTRICTED');
    expect(hasSession(res)).toBe(false);
    const user = await User.findOne({}).lean();
    expect(user?.consentRequiredAt).toEqual(NOW);
    expect(user?.birthYear).toBeUndefined();
  });

  it('la casilla que no coincide con la edad se rechaza y no guarda nada', async () => {
    const h = harness();
    await makeUser(DECLARED_BY_OTHER);
    await resetPassword(h);
    const res = await loginNew(h.app, { profile: consentFor(2010, 1, 'adult') });
    expect(res.status).toBe(400);
    expect((await User.findOne({}).lean())?.consentRequiredAt).toEqual(NOW);
  });

  it('también se pide al entrar con Google, y se guarda lo que ella declara', async () => {
    const h = harness();
    await makeUser(DECLARED_BY_OTHER);
    await resetPassword(h);

    const first = await googleLogin(h.app).expect(200);
    expect(googleLoginResponseSchema.parse(first.body)).toEqual({
      status: 'needs_profile',
      name: 'Lola Pérez',
      email: EMAIL,
    });
    expect(hasSession(first)).toBe(false);

    const second = await googleLogin(h.app, { profile: ADULT_CONSENT }).expect(200);
    expect(googleLoginResponseSchema.parse(second.body).status).toBe('ok');
    const user = await User.findOne({}).lean();
    expect(user?.birthYear).toBe(1990);
    expect(user?.consentRequiredAt).toBeUndefined();
  });
});

describe('restablecer contraseña · a quién NO toca', () => {
  it('una cuenta anterior a la edad (sin lo declarado) no se marca ni se le pide nada', async () => {
    const h = harness();
    await makeUser();
    const after = await resetPassword(h);
    expect(after?.consentRequiredAt).toBeUndefined();
    const res = await loginNew(h.app).expect(200);
    expect(loginResponseSchema.parse(res.body).status).toBe('ok');
  });

  it('una cuenta con el correo ya comprobado conserva lo que declaró', async () => {
    const h = harness();
    await makeUser({ ...DECLARED_BY_OTHER, emailVerifiedAt: new Date('2026-09-01T00:00:00Z') });
    const after = await resetPassword(h);
    expect(after?.consentRequiredAt).toBeUndefined();
    expect(after?.birthYear).toBe(1980);
    expect(after?.termsVersion).toBe('vieja');
  });

  it('una cuenta de equipo conserva lo que tiene', async () => {
    const h = harness();
    await makeUser({ ...DECLARED_BY_OTHER, role: 'EDITOR' });
    const after = await resetPassword(h);
    expect(after?.consentRequiredAt).toBeUndefined();
    expect(after?.birthYear).toBe(1980);
    const res = await loginNew(h.app).expect(200);
    expect(loginResponseSchema.parse(res.body).status).toBe('ok');
  });

  it('un ingreso normal no pide nada ni acepta un perfil que nadie pidió', async () => {
    const h = harness();
    await makeUser({ ...DECLARED_BY_OTHER, emailVerifiedAt: NOW });
    const res = await login(h.app, { profile: ADULT_CONSENT }).expect(200);
    expect(loginResponseSchema.parse(res.body).status).toBe('ok');
    expect((await User.findOne({}).lean())?.birthYear).toBe(1980);
  });
});

describe('ingreso con Google · cuenta creada con contraseña por otra persona', () => {
  const registerAsOther = (app: App) =>
    request(app)
      .post('/api/auth/register')
      .send({ name: 'Lola Pérez', email: EMAIL, password: PASSWORD, ...ADULT_CONSENT })
      .expect(201);

  it('primer paso: pide la edad y los consentimientos y NO cambia nada todavía', async () => {
    const h = harness();
    const created = await registerAsOther(h.app);
    const attackerCookies = setCookies(created)
      .map((c) => c.split(';')[0])
      .join('; ');
    const before = await User.findOne({}).lean();

    const res = await googleLogin(h.app).expect(200);
    expect(googleLoginResponseSchema.parse(res.body).status).toBe('needs_profile');
    expect(hasSession(res)).toBe(false);

    const after = await User.findOne({}).lean();
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(after?.tokenVersion).toBe(before?.tokenVersion);
    expect(after?.emailVerifiedAt).toBeUndefined();
    expect(after?.birthYear).toBe(1990);
    // La sesión de quien la creó sigue valiendo hasta que la dueña declare lo suyo.
    await request(h.app).get('/api/me').set('Cookie', attackerCookies).expect(200);
  });

  it('segundo paso: reemplaza lo declarado por lo de ella, rota la contraseña y cierra las sesiones', async () => {
    const h = harness();
    const created = await registerAsOther(h.app);
    const attackerCookies = setCookies(created)
      .map((c) => c.split(';')[0])
      .join('; ');
    const before = await User.findOne({}).lean();

    const res = await googleLogin(h.app, { profile: consentFor(2010, 1, 'minor_with_guardian') });
    expect(res.status).toBe(200);
    expect(googleLoginResponseSchema.parse(res.body).status).toBe('ok');

    const after = await User.findOne({}).lean();
    expect(after).toMatchObject({ birthYear: 2010, birthMonth: 1, guardianAuthorized: true });
    expect(after?.emailVerifiedAt).toEqual(NOW);
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
    expect(after?.tokenVersion).toBe((before?.tokenVersion ?? 0) + 1);
    await login(h.app).expect(401);
    await request(h.app).get('/api/me').set('Cookie', attackerCookies).expect(401);
  });

  it('si la dueña no alcanza la edad, la cuenta de quien la creó no se toca', async () => {
    const h = harness();
    await registerAsOther(h.app);
    const before = await User.findOne({}).lean();
    const res = await googleLogin(h.app, { profile: consentFor(2015, 5, 'adult') });
    expect(res.status).toBe(403);
    const after = await User.findOne({}).lean();
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(after?.emailVerifiedAt).toBeUndefined();
  });

  it('una cuenta anterior a la edad (sin lo declarado) sigue entrando directo y rota como antes', async () => {
    const h = harness();
    const old = await makeUser();
    const res = await googleLogin(h.app).expect(200);
    expect(googleLoginResponseSchema.parse(res.body).status).toBe('ok');
    const after = await User.findOne({}).lean();
    expect(after?.passwordHash).not.toBe(old.passwordHash);
    expect(after?.emailVerifiedAt).toEqual(NOW);
  });

  it('una cuenta de equipo entra directo y no se toca', async () => {
    const h = harness();
    const staff = await makeUser({ role: 'EDITOR', ...DECLARED_BY_OTHER });
    const res = await googleLogin(h.app).expect(200);
    expect(googleLoginResponseSchema.parse(res.body).status).toBe('ok');
    const after = await User.findOne({}).lean();
    expect(after?.passwordHash).toBe(staff.passwordHash);
    expect(after?.birthYear).toBe(1980);
  });
});

describe('ingreso con Google · carrera con un registro con contraseña', () => {
  it('si el registro gana la carrera, la dueña reclama la cuenta: contraseña rota, sesiones cerradas, su edad', async () => {
    const h = harness();
    const created = await request(h.app)
      .post('/api/auth/register')
      .send({ name: 'Lola Pérez', email: EMAIL, password: PASSWORD, ...ADULT_CONSENT })
      .expect(201);
    const attackerCookies = setCookies(created)
      .map((c) => c.split(';')[0])
      .join('; ');
    const before = await User.findOne({}).lean();

    // Para el ingreso con Google la cuenta todavía «no existía» cuando se buscó (la primera búsqueda).
    const real = User.findOne.bind(User);
    const spy = vi
      .spyOn(User, 'findOne')
      .mockImplementationOnce((() => Promise.resolve(null)) as unknown as typeof User.findOne);
    const res = await googleLogin(h.app, { profile: consentFor(2010, 1, 'minor_with_guardian') });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    void real;

    expect(res.status).toBe(200);
    expect(googleLoginResponseSchema.parse(res.body).status).toBe('ok');
    const after = await User.findOne({}).lean();
    expect(await User.countDocuments({})).toBe(1);
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
    expect(after?.tokenVersion).toBe((before?.tokenVersion ?? 0) + 1);
    expect(after).toMatchObject({ birthYear: 2010, guardianAuthorized: true });
    expect(after?.emailVerifiedAt).toEqual(NOW);
    await login(h.app).expect(401);
    await request(h.app).get('/api/me').set('Cookie', attackerCookies).expect(401);
  });
});
