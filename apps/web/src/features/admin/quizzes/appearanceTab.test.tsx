import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, json, mockApi, renderAt } from '../../../test/mockApi';

// jsdom no decodifica imágenes: la medida del fondo se resuelve sin dato (se usa el piso seguro).
vi.mock('../../../shared/lib/measureBackdrop', () => ({
  measureBackdrop: () => Promise.resolve(undefined),
}));

afterEach(() => vi.unstubAllGlobals());

const ADMIN = {
  id: '670000000000000000000003',
  name: 'Autora',
  email: 'a@ejemplo.com',
  role: 'ADMIN',
};
const BOOK_ID = '670000000000000000000010';
const QUIZ_ID = '670000000000000000000020';
const stamp = '2026-10-01T10:00:00.000Z';

const photo = (name: string) => ({
  provider: 'cloudinary',
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/${name}.jpg`,
  width: 1920,
  height: 1080,
  alt: `Fondo ${name}`,
  deliveryType: 'upload',
});
const appearance = (over: object = {}) => ({
  background: { kind: 'image', image: photo('uno') },
  overlay: { mode: 'manual', strength: 0.8 },
  accent: '#a89bff',
  introHtml: '<p>Una niebla espesa.</p>',
  ...over,
});
const history = [
  {
    rev: 1,
    at: stamp,
    by: { id: ADMIN.id, name: 'Autora' },
    action: 'seed',
    changed: ['background', 'introHtml'],
  },
  {
    rev: 2,
    at: stamp,
    by: { id: ADMIN.id, name: null },
    action: 'update',
    changed: ['accent'],
  },
];
const state = (over: object = {}) => ({
  appearance: appearance(),
  rev: 2,
  history,
  warnings: [],
  ...over,
});
const detail = (over: object = {}) => ({
  id: QUIZ_ID,
  bookId: BOOK_ID,
  slug: 'quiz-1',
  order: 1,
  title: 'Quiz Uno',
  status: 'published',
  currentVersion: 1,
  allowRetake: true,
  showBreakdown: false,
  updatedAt: stamp,
  draft: {
    title: 'Quiz Uno',
    instructionsHtml: '<p>Instrucciones del snapshot</p>',
    settings: { allowRetake: true, showBreakdown: false },
    stages: [],
    results: [],
  },
  hasUnpublishedChanges: false,
  appearanceRev: 2,
  ...over,
});
const base = (extra: Record<string, unknown> = {}, quizOver: object = {}) => ({
  'GET /api/admin/books': () => json({ books: [] }),
  [`GET /api/admin/quizzes/${QUIZ_ID}`]: () => json(detail(quizOver)),
  ...extra,
});

async function openTab() {
  const user = userEvent.setup();
  renderAt(`/admin/quizzes/${QUIZ_ID}`);
  await user.click(await screen.findByRole('tab', { name: 'Apariencia' }));
  return user;
}

describe('pestaña Apariencia', () => {
  it('con apariencia, el editor viejo oculta introducción y portada y explica dónde se editan', async () => {
    mockApi(base({}, { appearance: appearance() }), { session: ADMIN });
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    expect(
      await screen.findByText(/La introducción y la portada se editan en la pestaña/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Instrucciones' })).toBeNull();
    expect(screen.queryByText('Imagen del quiz (opcional)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ir a Apariencia' })).toBeInTheDocument();
  });

  it('sin apariencia, el editor viejo sigue mostrando instrucciones e imagen', async () => {
    mockApi(base(), { session: ADMIN });
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    expect(
      await screen.findByRole('textbox', { name: 'Instrucciones para la lectora' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/se editan en la pestaña/)).toBeNull();
  });

  it('la primera vez rellena la introducción con la del quiz y no marca cambios', async () => {
    mockApi(
      base({
        [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () =>
          json({ appearance: null, rev: 0, history: [], warnings: [] }),
      }),
      { session: ADMIN },
    );
    await openTab();
    expect(
      (await screen.findAllByText('Instrucciones del snapshot')).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Tienes cambios sin guardar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Guardar apariencia' })).toBeDisabled();
    expect(screen.getByText('Todavía no hay cambios guardados.')).toBeInTheDocument();
  });

  it('el velo manual no baja de 78 % y el modo automático bloquea el control', async () => {
    mockApi(
      base({
        [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () => json(state()),
      }),
      { session: ADMIN },
    );
    await openTab();
    const range = (await screen.findByLabelText(/Intensidad/)) as HTMLInputElement;
    expect(range.min).toBe('0.78');
    expect(range.max).toBe('0.92');
    expect(range).toBeEnabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Automático' }));
    expect(range).toBeDisabled();
    expect(range.min).toBe('0.5');
  });

  it('guarda con la revisión que vio, avisa del éxito y marca el editor viejo para ocultar sus campos', async () => {
    const { called } = mockApi(
      base({
        [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () => json(state()),
        [`PUT /api/admin/quizzes/${QUIZ_ID}/appearance`]: () =>
          json(state({ rev: 3, history: [...history] })),
      }),
      { session: ADMIN },
    );
    const user = await openTab();
    await user.click(await screen.findByRole('radio', { name: /Verde/ }));
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar apariencia' }));
    await screen.findByText(/Ya lo ven las lectoras, sin publicar una versión nueva/);
    // El aviso sigue ahí tras refrescarse los datos del quiz (no se remonta la pestaña).
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(
      screen.getByText(/Ya lo ven las lectoras, sin publicar una versión nueva/),
    ).toBeInTheDocument();
    const put = called(`PUT /api/admin/quizzes/${QUIZ_ID}/appearance`)[0];
    expect(put?.body).toMatchObject({ expectedRev: 2, appearance: { accent: '#5fe3ae' } });
    expect(put?.body).toMatchObject({ appearance: { introHtml: '<p>Una niebla espesa.</p>' } });
  });

  it('409 por edición simultánea: no pisa, explica y ofrece cargar la versión actual', async () => {
    let reads = 0;
    mockApi(
      base({
        [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () =>
          json(
            reads++ === 0
              ? state()
              : state({ rev: 3, appearance: appearance({ accent: 'warning' }) }),
          ),
        [`PUT /api/admin/quizzes/${QUIZ_ID}/appearance`]: () =>
          apiError('CONFLICT', 'Otra persona cambió la apariencia', 409),
      }),
      { session: ADMIN },
    );
    const user = await openTab();
    await user.click(await screen.findByRole('radio', { name: /Verde/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar apariencia' }));
    expect(
      await screen.findByText('Otra persona cambió la apariencia mientras editabas'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cargar la versión actual' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Ámbar/ })).toBeChecked());
    expect(screen.queryByText('Otra persona cambió la apariencia mientras editabas')).toBeNull();
  });

  it('un quiz archivado no se puede editar: controles bloqueados y aviso', async () => {
    mockApi(
      base(
        { [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () => json(state()) },
        { status: 'archived' },
      ),
      { session: ADMIN },
    );
    await openTab();
    expect(await screen.findByText('La apariencia no se puede cambiar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar apariencia' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Volver a antes' })[0]).toBeDisabled();
  });

  it('el historial lista lo que cambió y revierte al estado anterior con la revisión vigente', async () => {
    const { called } = mockApi(
      base({
        [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () => json(state()),
        [`POST /api/admin/quizzes/${QUIZ_ID}/appearance/revert`]: () =>
          json(state({ rev: 3, appearance: appearance({ accent: undefined }) })),
      }),
      { session: ADMIN },
    );
    const user = await openTab();
    expect(await screen.findByText(/#2 · Edición/)).toBeInTheDocument();
    // Del más reciente al más antiguo, sin importar el orden en que llegue.
    const entries = screen.getAllByText(/^#\d · /).map((node) => node.textContent);
    expect(entries).toEqual(['#2 · Edición', '#1 · Primera edición']);
    expect(screen.getByText(/Cambió: fondo, introducción/)).toBeInTheDocument();
    expect(screen.getByText(/cuenta eliminada/)).toBeInTheDocument();
    // Pide confirmación: las lectoras lo ven en seguida.
    await user.click(screen.getAllByRole('button', { name: 'Volver a antes' })[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: '¿Volver a la apariencia anterior?' });
    await user.click(within(dialog).getByRole('button', { name: 'Volver a esta apariencia' }));
    await screen.findByText(/Se volvió al estado anterior/);
    expect(called(`POST /api/admin/quizzes/${QUIZ_ID}/appearance/revert`)[0]?.body).toEqual({
      rev: 2,
      expectedRev: 2,
    });
  });

  it('la vista previa muestra el celular y el escritorio con el título y contenido de muestra', async () => {
    mockApi(base({ [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () => json(state()) }), {
      session: ADMIN,
    });
    const user = await openTab();
    const preview = await screen.findByTestId('quiz-preview');
    expect(preview).toHaveAttribute('data-size', 'movil');
    expect(preview).toHaveTextContent('Quiz Uno');
    expect(preview).toHaveTextContent('Una niebla espesa.');
    await user.click(screen.getByRole('button', { name: /Escritorio · 1280 px/ }));
    expect(screen.getByTestId('quiz-preview')).toHaveAttribute('data-size', 'escritorio');
  });

  it('la vista previa muestra el número real «Quiz N de M» y la barra de guardado indica el estado', async () => {
    const row = (id: string, order: number, status = 'published') => ({
      id,
      bookId: BOOK_ID,
      slug: `quiz-${order}`,
      order,
      title: `Quiz ${order}`,
      status,
      currentVersion: 1,
      allowRetake: true,
      showBreakdown: false,
      updatedAt: stamp,
      hasUnpublishedChanges: false,
    });
    mockApi(
      base({
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () =>
          json({
            quizzes: [
              row('670000000000000000000021', 1),
              row('670000000000000000000022', 2, 'archived'),
              row(QUIZ_ID, 3),
              row('670000000000000000000023', 4),
            ],
          }),
        [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () => json(state()),
      }),
      { session: ADMIN },
    );
    const user = await openTab();
    // Los archivados no cuentan: de cuatro quizzes, uno archivado, este es el 2.º de 3 vigentes.
    expect(await screen.findByText('Quiz 2 de 3')).toBeInTheDocument();
    expect(screen.getByText('Todo guardado')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Verde/ }));
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Guardar apariencia' }).closest('.admin-savebar'),
    ).not.toBeNull();
  });

  it('cambiar de pestaña no tira los cambios sin guardar de Apariencia', async () => {
    mockApi(base({ [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () => json(state()) }), {
      session: ADMIN,
    });
    const user = await openTab();
    await user.click(await screen.findByRole('radio', { name: /Verde/ }));
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Datos' }));
    await user.click(screen.getByRole('tab', { name: 'Apariencia' }));
    expect(screen.getByRole('radio', { name: /Verde/ })).toBeChecked();
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
  });

  describe('color de acento libre', () => {
    const open = async (accent: string | undefined = '#a89bff') => {
      const { called } = mockApi(
        base({
          [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () =>
            json(state({ appearance: appearance(accent ? { accent } : { accent: undefined }) })),
          [`PUT /api/admin/quizzes/${QUIZ_ID}/appearance`]: ({ body }: { body: unknown }) =>
            json(state({ rev: 3, appearance: (body as { appearance: object }).appearance })),
        }),
        { session: ADMIN },
      );
      const user = await openTab();
      return {
        user,
        called,
        hex: await screen.findByRole('textbox', { name: 'Código del color' }),
      };
    };

    it('muestra el código #RRGGBB del color guardado y acepta uno nuevo con o sin # y en minúsculas', async () => {
      const { user, hex, called } = await open();
      expect(hex).toHaveValue('#A89BFF');
      await user.clear(hex);
      await user.type(hex, 'ff8fb1');
      expect(hex).toHaveValue('#FF8FB1');
      expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Guardar apariencia' }));
      await screen.findByText(/Ya lo ven las lectoras/);
      expect(called(`PUT /api/admin/quizzes/${QUIZ_ID}/appearance`)[0]?.body).toMatchObject({
        appearance: { accent: '#ff8fb1' },
      });
    });

    it('un código incompleto no cambia nada y avisa; al salir vuelve al color guardado', async () => {
      const { user, hex } = await open();
      await user.type(hex, '{backspace}{backspace}'); // '#A89B': incompleto
      expect(hex).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText(/Escribe un código de 6 cifras/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Guardar apariencia' })).toBeDisabled();
      await user.tab();
      expect(hex).toHaveValue('#A89BFF');
    });

    it('vaciar el campo o elegir «Por defecto» quita el acento; los colores rápidos lo fijan', async () => {
      const { user, hex } = await open();
      await user.click(screen.getByRole('radio', { name: 'Rosa' }));
      expect(hex).toHaveValue('#FF8FB1');
      await user.click(screen.getByRole('radio', { name: 'Por defecto' }));
      expect(hex).toHaveValue('');
      await user.type(hex, '#3fd8ff');
      expect(screen.getByRole('radio', { name: 'Cian' })).toBeChecked();
    });

    it('un color que no se leería se ajusta lo mínimo y se le dice a la autora, con el antes y el después', async () => {
      const { user, hex } = await open();
      expect(screen.getByText('El color se lee bien sobre el fondo')).toBeInTheDocument();
      await user.clear(hex);
      await user.type(hex, '#1a3a6e');
      expect(await screen.findByText('Ajustamos tu color para que se lea')).toBeInTheDocument();
      const after = screen.getByText('Se verá así').parentElement as HTMLElement;
      expect(screen.getByText('Tu color').parentElement).toHaveTextContent('#1A3A6E');
      expect(after.textContent).toMatch(/#[0-9A-F]{6}/);
      expect(after.textContent).not.toContain('#1A3A6E');
      // La vista previa pinta el color ajustado (no el elegido) y se guarda lo elegido.
      const preview = screen.getByTestId('quiz-preview');
      const painted = preview.style.getPropertyValue('--quiz-accent');
      expect(painted).toMatch(/^#[0-9a-f]{6}$/);
      expect(painted).not.toBe('#1a3a6e');
    });
  });
});
