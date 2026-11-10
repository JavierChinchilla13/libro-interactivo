import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, BOOK_ID, READER, json, mockApi, renderAt } from '../../../test/mockApi';

const STAMP = '2026-10-01T15:00:00.000Z';
const adminBook = {
  ...BOOK,
  synopsis: '',
  genres: [],
  purchaseLinks: [],
  showInReaderPanel: false,
  wikiSections: [],
  createdAt: STAMP,
  updatedAt: STAMP,
};

afterEach(() => vi.unstubAllGlobals());

const ADMIN = { ...READER, id: '670000000000000000000002', name: 'Marisol Quesada', role: 'ADMIN' };
const EDITOR = { ...ADMIN, id: '670000000000000000000003', name: 'Editora', role: 'EDITOR' };
const POST_ID = '670000000000000000000050';
const JOB_ID = '670000000000000000000070';

const quota = { todayLeft: 80, monthLeft: 2540, reserve: 20, dailyLimit: 100, monthlyLimit: 3000 };
const preview = (over: object = {}) => ({
  available: true,
  recipients: 12,
  quota,
  estimatedDays: 1,
  existing: null,
  ...over,
});
const job = (over: object = {}) => ({
  id: JOB_ID,
  kind: 'post',
  refId: POST_ID,
  subject: 'Novedad en Universo Memorias: Feria del libro',
  status: 'sending',
  createdAt: '2026-11-09T15:00:00.000Z',
  createdBy: { id: ADMIN.id, name: 'Marisol Quesada' },
  notBefore: '2026-11-09T15:00:00.000Z',
  totals: { recipients: 120, sent: 40, skipped: 2, failed: 0, pending: 78 },
  ...over,
});
const post = (over: object = {}) => ({
  id: POST_ID,
  slug: 'feria-del-libro-2027',
  title: 'Feria del Libro 2027',
  template: 'event',
  category: 'evento',
  excerpt: '',
  featured: false,
  status: 'published',
  publishedAt: '2026-10-01T15:00:00.000Z',
  createdAt: '2026-10-01T15:00:00.000Z',
  updatedAt: '2026-10-01T15:00:00.000Z',
  data: { startsAt: '2027-03-20T22:00:00.000Z', venue: 'Librería Central', bodyHtml: '' },
  ...over,
});

const NEW_PREVIEW = 'GET /api/admin/notifications/preview?kind=post';
const SAVED_PREVIEW = `GET /api/admin/notifications/preview?kind=post&refId=${POST_ID}`;
const CREATE = 'POST /api/admin/notifications';

async function fillEvent() {
  await userEvent.type(
    await screen.findByRole('textbox', { name: /^Título/ }),
    'Feria del Libro 2027',
  );
  await userEvent.type(screen.getByLabelText('Lugar'), 'Librería Central');
  fireEvent.change(screen.getByLabelText('Inicia'), { target: { value: '2027-03-20T16:00' } });
}

describe('casilla «Avisar por correo» al publicar una actualización', () => {
  it('la administradora ve a quién llega y el cupo; al publicar con la casilla se pide el aviso', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        'POST /api/admin/posts': ({ body }) => json(post({ ...(body as object) }), 201),
        [`GET /api/admin/posts/${POST_ID}`]: () => json(post()),
        [NEW_PREVIEW]: () => json(preview()),
        [SAVED_PREVIEW]: () => json(preview({ available: false, existing: job() })),
        [CREATE]: () => json({ job: job({ status: 'queued' }), created: true }, 201),
      },
      { session: ADMIN },
    );
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await fillEvent();
    const box = await screen.findByLabelText(/Avisar por correo a las lectoras apuntadas/);
    expect(await screen.findByText(/12 lectoras/)).toBeInTheDocument();
    expect(screen.getByText(/Quedan/)).toHaveTextContent(
      /Quedan 80 correos para avisos hoy y 2\s?540 este mes/,
    );
    expect(screen.getByText(/Con el cupo de hoy alcanza/)).toBeInTheDocument();
    await userEvent.click(box);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(called(CREATE)).toHaveLength(1));
    expect(called(CREATE)[0]?.body).toEqual({ kind: 'post', refId: POST_ID });
    expect(
      await screen.findByText(/Aviso por correo en cola para 120 lectoras/),
    ).toBeInTheDocument();
    // Ya guardada y avisada: en lugar de la casilla, cómo va el envío.
    expect(await screen.findByText(/Ya se avisó por correo/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Avisar por correo a las lectoras/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver avisos por correo' })).toHaveAttribute(
      'href',
      '/admin/avisos',
    );
  });

  it('sin marcar la casilla, publicar no pide ningún aviso', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        'POST /api/admin/posts': ({ body }) => json(post({ ...(body as object) }), 201),
        [`GET /api/admin/posts/${POST_ID}`]: () => json(post()),
        [NEW_PREVIEW]: () => json(preview()),
        [SAVED_PREVIEW]: () => json(preview()),
      },
      { session: ADMIN },
    );
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await fillEvent();
    await screen.findByText(/12 lectoras/);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(called('POST /api/admin/posts')).toHaveLength(1));
    expect(called(CREATE)).toHaveLength(0);
  });

  it('marcada pero guardada como borrador: todavía no se avisa', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        'POST /api/admin/posts': ({ body }) => json(post({ ...(body as object) }), 201),
        [`GET /api/admin/posts/${POST_ID}`]: () => json(post({ status: 'draft' })),
        [NEW_PREVIEW]: () => json(preview()),
        [SAVED_PREVIEW]: () => json(preview({ available: false })),
      },
      { session: ADMIN },
    );
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await fillEvent();
    expect(
      await screen.findByText(/Si solo guardas el borrador, todavía no se avisa/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Avisar por correo a las lectoras apuntadas/));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(called('POST /api/admin/posts')).toHaveLength(1));
    expect(called(CREATE)).toHaveLength(0);
  });

  it('sin lectoras apuntadas la casilla queda desactivada y lo dice', async () => {
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [NEW_PREVIEW]: () => json(preview({ recipients: 0 })),
      },
      { session: ADMIN },
    );
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    expect(await screen.findByText(/no hay lectoras apuntadas/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Avisar por correo a las lectoras apuntadas/)).toBeDisabled();
  });

  it('una editora no ve la casilla ni consulta el cupo (solo administradoras)', async () => {
    const { calls } = mockApi(
      { 'GET /api/admin/books': () => json({ books: [] }) },
      { session: EDITOR },
    );
    renderAt('/admin/actualizaciones/nueva?plantilla=event');
    await fillEvent();
    expect(screen.queryByText('Aviso por correo')).not.toBeInTheDocument();
    expect(calls.some((call) => call.url.includes('/admin/notifications'))).toBe(false);
  });

  it('en un capítulo extra el resumen dice que solo llega a quien terminó el libro', async () => {
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [adminBook] }),
        [`GET /api/admin/notifications/preview?kind=extra&bookId=${BOOK_ID}`]: () =>
          json(preview({ recipients: 3, estimatedDays: 1 })),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/extras/nuevo?libro=${BOOK_ID}`);
    expect(await screen.findByText(/que ya terminaron este libro/)).toBeInTheDocument();
    expect(screen.getByText(/3 lectoras/)).toBeInTheDocument();
  });
});

describe('/admin/avisos', () => {
  const LIST = 'GET /api/admin/notifications';

  it('lista los avisos con su avance y el cupo, y está en el menú de la administradora', async () => {
    mockApi(
      {
        [LIST]: () =>
          json({
            jobs: [
              job(),
              job({
                id: '670000000000000000000071',
                subject: 'Hay un capítulo extra nuevo',
                kind: 'extra',
                status: 'done',
                totals: { recipients: 5, sent: 5, skipped: 0, failed: 0, pending: 0 },
              }),
            ],
          }),
        [NEW_PREVIEW]: () => json(preview({ recipients: 130 })),
      },
      { session: ADMIN },
    );
    renderAt('/admin/avisos');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Avisos por correo' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Avisos por correo · Administración · Universo Memorias');
    expect(await screen.findByText('40 de 120 enviados')).toBeInTheDocument();
    expect(screen.getByText(/2 sin enviar/)).toBeInTheDocument();
    expect(screen.getByText('Enviando')).toBeInTheDocument();
    expect(screen.getByText('Terminado')).toBeInTheDocument();
    expect(screen.getByText('5 de 5 enviados')).toBeInTheDocument();
    expect(await screen.findByText('130')).toBeInTheDocument();
    expect(screen.getByText(/se guardan 20 al día/i)).toBeInTheDocument();
    // Solo lo que sigue en marcha se puede cancelar.
    expect(screen.getAllByRole('button', { name: /^Cancelar/ })).toHaveLength(1);
    const nav = screen.getAllByRole('navigation')[0]!;
    expect(within(nav).getByRole('link', { name: /Avisos por correo/ })).toBeInTheDocument();
  });

  it('cancelar pide confirmación y luego cancela lo pendiente', async () => {
    let cancelled = false;
    const { called } = mockApi(
      {
        [LIST]: () => json({ jobs: [job(cancelled ? { status: 'cancelled' } : {})] }),
        [NEW_PREVIEW]: () => json(preview()),
        [`POST /api/admin/notifications/${JOB_ID}/cancel`]: () => {
          cancelled = true;
          return json(job({ status: 'cancelled' }));
        },
      },
      { session: ADMIN },
    );
    renderAt('/admin/avisos');
    await userEvent.click(await screen.findByRole('button', { name: /^Cancelar/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Faltan 78 correos por enviar/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar el aviso' }));
    await waitFor(() =>
      expect(called(`POST /api/admin/notifications/${JOB_ID}/cancel`)).toHaveLength(1),
    );
    expect(await screen.findByText('Cancelado')).toBeInTheDocument();
  });

  it('un aviso sin cupo dice cuándo sigue solo', async () => {
    const tomorrow = new Date(Date.now() + 6 * 3_600_000).toISOString();
    mockApi(
      {
        [LIST]: () => json({ jobs: [job({ pausedUntil: tomorrow })] }),
        [NEW_PREVIEW]: () => json(preview()),
      },
      { session: ADMIN },
    );
    renderAt('/admin/avisos');
    expect(await screen.findByText('En pausa')).toBeInTheDocument();
    expect(screen.getByText(/Se acabó el cupo de correos: sigue solo/)).toBeInTheDocument();
  });

  it('sin avisos explica cómo pedir uno', async () => {
    mockApi(
      { [LIST]: () => json({ jobs: [] }), [NEW_PREVIEW]: () => json(preview()) },
      { session: ADMIN },
    );
    renderAt('/admin/avisos');
    expect(await screen.findByText('Todavía no se envió ningún aviso')).toBeInTheDocument();
  });
});
