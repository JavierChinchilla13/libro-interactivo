import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';
import { seedPublishedQuiz } from './seed';

/** Mismo valor por defecto de desarrollo que usa el API (solo existe fuera de producción). */
const DEV_ACCESS_SECRET = 'solo-para-desarrollo-token-de-qr-no-usar-en-produccion-9876';
const tokenFor = (id: string) =>
  `${id}.${createHmac('sha256', DEV_ACCESS_SECRET).update(id).digest('base64url')}`;
const PASSWORD = 'Nube-Azul-Cuatro-87';

async function created(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: string };
}

test.describe('wiki pública (celular y escritorio)', () => {
  test('lo bloqueado no entrega nada hasta completar el quiz; lo público se busca y se abre', async ({
    browser,
    playwright,
    baseURL,
  }) => {
    const stamp = Date.now();
    const admin = await playwright.request.newContext({ baseURL });
    expect(
      (
        await admin.post('/api/auth/login', {
          data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
        })
      ).status(),
    ).toBe(200);
    const { bookId, quizId } = await seedPublishedQuiz(admin, stamp);

    // La autora bloquea los personajes hasta completar el quiz; el glosario es público.
    const book = await (await admin.get(`/api/admin/books/${bookId}`)).json();
    const { id, createdAt, updatedAt, ...editable } = book;
    void id;
    void createdAt;
    void updatedAt;
    const saved = await admin.put(`/api/admin/books/${bookId}`, {
      data: {
        ...editable,
        wikiSections: [
          {
            kind: 'character',
            title: 'Personajes',
            order: 1,
            enabled: true,
            unlockAfter: { kind: 'quiz', refId: quizId },
            lockedMessage: 'Se habilita al completar el primer quiz',
          },
          { kind: 'term', title: 'Glosario', order: 2, enabled: true },
        ],
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const entry = async (slug: string, kind: string, name: string) =>
      created(
        await admin.post('/api/admin/wiki', {
          data: {
            bookId,
            kind,
            slug,
            name,
            status: 'published',
            bodyHtml: `<p>Ficha de ${name}</p>`,
          },
        }),
      );
    const ana = await entry('ana', 'character', 'Ana Reservada');
    await entry('alfa', 'term', 'Alfa E2E');
    await entry('beta', 'term', 'Beta E2E');
    const code = await created(
      await admin.post('/api/admin/access-tokens', { data: { kind: 'quiz', refId: quizId } }),
    );

    const context = await browser.newContext();
    await context.addInitScript(
      (value) => localStorage.setItem('libro_selected_book', value),
      bookId,
    );
    const page = await context.newPage();

    // 1) Visitante: la pestaña de personajes está bloqueada y no entrega NADA, ni por la API directa.
    await page.goto('/wiki');
    await expect(page.getByRole('tab', { name: /🔒 Personajes/ })).toBeVisible();
    await expect(page.getByText('Se habilita al completar el primer quiz')).toBeVisible();
    await expect(page.getByText('Ana Reservada')).toHaveCount(0);
    const direct = await page.request.get(`/api/wiki/entries?bookId=${bookId}&kind=character`);
    expect(direct.status()).toBe(403);
    expect(await direct.text()).not.toContain('Ana');
    const byId = await page.request.get(`/api/wiki/entries/${ana.id}`);
    expect(byId.status()).toBe(403);
    expect(await byId.text()).not.toContain('Ana');
    await page.goto(`/wiki/entrada/${ana.id}`);
    await expect(page.getByText('Esta entrada está bloqueada')).toBeVisible();
    await expect(page.getByText('Ana Reservada')).toHaveCount(0);

    // 2) El glosario es público: se busca mientras se escribe y se abre una ficha.
    await page.goto('/wiki/glosario');
    await expect(page.getByRole('link', { name: /Alfa E2E/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Beta E2E/ })).toBeVisible();
    await page.getByLabel('Buscar un término').fill('alf');
    await expect(page.getByRole('link', { name: /Beta E2E/ })).toHaveCount(0);
    await page.getByRole('link', { name: /Alfa E2E/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Alfa E2E' })).toBeVisible();
    await expect(page.getByText('Ficha de Alfa E2E')).toBeVisible();

    // 3) Una lectora se registra, canjea el QR y completa el quiz: SOLO entonces se abren los personajes.
    const email = `lectora-wiki-${stamp}@ejemplo.com`;
    await created(
      await page.request.post('/api/auth/register', {
        data: { name: 'Lectora Wiki', email, password: PASSWORD },
      }),
    );
    expect((await page.request.get(`/api/wiki/entries/${ana.id}`)).status()).toBe(403);
    const redeem = await page.request.post('/api/access/redeem', {
      data: { token: tokenFor(code.id) },
    });
    expect(redeem.status(), await redeem.text()).toBe(200);
    // Desbloquear el quiz con el QR no abre la wiki: falta completarlo.
    expect((await page.request.get(`/api/wiki/entries/${ana.id}`)).status()).toBe(403);
    const attempt = await (await page.request.post(`/api/quizzes/${quizId}/attempts`)).json();
    const question = attempt.stage.questions[0];
    const done = await page.request.post(
      `/api/attempts/${attempt.attemptId}/stages/${attempt.stage.stageId}/answers`,
      { data: { answers: [{ questionId: question.id, answerId: question.answers[0].id }] } },
    );
    expect(done.status(), await done.text()).toBe(200);
    expect((await page.request.get(`/api/wiki/entries/${ana.id}`)).status()).toBe(200);

    await page.goto('/wiki/personajes');
    await expect(page.getByRole('link', { name: /Ana Reservada/ })).toBeVisible();
    await page.getByRole('link', { name: /Ana Reservada/ }).click();
    await expect(page.getByText('Ficha de Ana Reservada')).toBeVisible();

    // 4) Al cerrar sesión vuelve a verse bloqueado (la caché no mezcla personas).
    await page.request.post('/api/auth/logout');
    await page.goto('/wiki/personajes');
    await expect(page.getByText('Se habilita al completar el primer quiz')).toBeVisible();
    await expect(page.getByText('Ana Reservada')).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await context.close();
    await admin.dispose();
  });
});
