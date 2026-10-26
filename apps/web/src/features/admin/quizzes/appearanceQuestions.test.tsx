import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../../test/mockApi';

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
const QUIZ_ID = '670000000000000000000020';
const stamp = '2026-10-01T10:00:00.000Z';
const URL_OF = (name: string) =>
  `https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/${name}.jpg`;
const photo = (name: string) => ({
  provider: 'cloudinary',
  publicId: `libro/quiz-bg/${name}`,
  url: URL_OF(name),
  width: 1920,
  height: 1080,
  alt: `Fondo ${name}`,
  deliveryType: 'upload',
});
const video = (name: string) => ({
  provider: 'cloudinary',
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/${name}.mp4`,
  posterUrl: `https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/${name}.jpg`,
  width: 1280,
  height: 720,
  durationSeconds: 8,
  bytes: 1_000_000,
  alt: `Video ${name}`,
});

const question = (id: string, text: string) => ({
  id,
  text,
  answers: [
    { id: `${id}a`, text: 'A', resultKey: 'r1' },
    { id: `${id}b`, text: 'B', resultKey: 'r1' },
  ],
});
const stage = (
  id: string,
  title: string | undefined,
  questions: ReturnType<typeof question>[],
) => ({
  id,
  order: 1,
  shuffleQuestions: true,
  shuffleAnswers: true,
  producesFinal: true,
  ...(title ? { title } : {}),
  questions,
});

const detail = (stages: ReturnType<typeof stage>[]) => ({
  id: QUIZ_ID,
  bookId: '670000000000000000000010',
  slug: 'quiz-3',
  order: 1,
  title: 'Quiz Tres',
  status: 'published',
  currentVersion: 1,
  allowRetake: true,
  showBreakdown: false,
  updatedAt: stamp,
  draft: {
    title: 'Quiz Tres',
    instructionsHtml: '<p>Intro</p>',
    settings: { allowRetake: true, showBreakdown: false },
    stages,
    results: [],
  },
  hasUnpublishedChanges: false,
  appearanceRev: 2,
});

const general = {
  background: { kind: 'image', image: photo('general') },
  overlay: { mode: 'manual', strength: 0.8 },
  accent: '#a89bff',
  introHtml: '<p>Intro</p>',
};

const TWO_STAGES = [
  stage('etapa-1', 'Primera', [
    question('p1', '¿Qué haces cuando nadie mira?'),
    question('p2', '¿A dónde irías si pudieras irte ya?'),
  ]),
  stage('etapa-2', 'Segunda', [question('p3', 'Elige una puerta.')]),
];

function setup(stages: ReturnType<typeof stage>[], questions: object = {}) {
  const mock = mockApi(
    {
      'GET /api/admin/books': () => json({ books: [] }),
      [`GET /api/admin/quizzes/${QUIZ_ID}`]: () => json(detail(stages)),
      [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () =>
        json({
          appearance: {
            ...general,
            ...(Object.keys(questions).length > 0 ? { questions } : {}),
          },
          rev: 2,
          history: [],
          warnings: [],
        }),
      [`PUT /api/admin/quizzes/${QUIZ_ID}/appearance`]: () =>
        json({ appearance: general, rev: 3, history: [], warnings: [] }),
    },
    { session: ADMIN },
  );
  return mock;
}

async function openTab() {
  const user = userEvent.setup();
  renderAt(`/admin/quizzes/${QUIZ_ID}`);
  await user.click(await screen.findByRole('tab', { name: 'Apariencia' }));
  await screen.findByRole('heading', { name: 'Por pregunta' });
  return user;
}

const caps = () => screen.getByRole('list', { name: 'Topes de apariencia por pregunta' });
const rowOf = (text: string) => screen.getByText(text).closest('li')!;

describe('Apariencia · Por pregunta', () => {
  it('lista las preguntas por etapa con su texto; todas usan el general al principio', async () => {
    setup(TWO_STAGES);
    await openTab();
    expect(screen.getByRole('region', { name: /Etapa 1 · Primera/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Etapa 2 · Segunda/ })).toBeInTheDocument();
    expect(screen.getByText('¿Qué haces cuando nadie mira?')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('radio', { name: 'Usar el general' })
        .every((r) => (r as HTMLInputElement).checked),
    ).toBe(true);
    expect(caps()).toHaveTextContent('Preguntas con fondo propio: 0 de 5');
    expect(screen.queryByText('Personalizada')).toBeNull();
  });

  it('personalizar una pregunta solo cambia el campo que se toca; lo demás queda «igual que el general» y se guarda por id', async () => {
    const { called } = setup(TWO_STAGES);
    const user = await openTab();
    await user.click(
      within(rowOf('¿A dónde irías si pudieras irte ya?')).getByRole('radio', {
        name: 'Personalizar',
      }),
    );
    const row = rowOf('¿A dónde irías si pudieras irte ya?');
    for (const label of [
      'Fondo: igual que el general',
      'Velo: igual que el general',
      'Acento: igual que el general',
    ]) {
      expect(within(row).getByRole('checkbox', { name: label })).toBeChecked();
    }
    // Solo el acento: se desmarca «igual que el general» y se elige Rosa.
    await user.click(within(row).getByRole('checkbox', { name: 'Acento: igual que el general' }));
    await user.click(within(row).getByRole('radio', { name: /Rosa/ }));
    expect(
      within(row).getByRole('checkbox', { name: 'Fondo: igual que el general' }),
    ).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Guardar apariencia' }));
    await screen.findByText(/Ya lo ven las lectoras/);
    const put = called(`PUT /api/admin/quizzes/${QUIZ_ID}/appearance`)[0];
    expect(put?.body).toMatchObject({ appearance: { questions: { p2: { accent: '#ff8fb1' } } } });
    const sent = (put?.body as { appearance: { questions: Record<string, object> } }).appearance
      .questions;
    expect(Object.keys(sent)).toEqual(['p2']);
    expect(sent.p2).toEqual({ accent: '#ff8fb1' });
  });

  it('volver a «Usar el general» descarta los ajustes propios de esa pregunta', async () => {
    setup(TWO_STAGES, { p1: { accent: '#ff8fb1' } });
    const user = await openTab();
    const row = rowOf('¿Qué haces cuando nadie mira?');
    expect(within(row).getByText('Personalizada')).toBeInTheDocument();
    await user.click(within(row).getByRole('radio', { name: 'Usar el general' }));
    expect(screen.queryByText('Personalizada')).toBeNull();
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
  });

  it('muestra los topes y, al llegar a 5 preguntas con fondo propio, no deja elegir otro medio', async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      question(`q${i + 1}`, `Pregunta número ${i + 1}`),
    );
    const own = Object.fromEntries(
      [1, 2, 3, 4, 5].map((n) => [
        `q${n}`,
        { background: { kind: 'image', image: photo(`p${n}`) } },
      ]),
    );
    setup([stage('etapa-1', undefined, many)], own);
    const user = await openTab();
    expect(caps()).toHaveTextContent('Preguntas con fondo propio: 5 de 5 (tope)');
    const row = rowOf('Pregunta número 6');
    await user.click(within(row).getByRole('radio', { name: 'Personalizar' }));
    await user.click(within(row).getByRole('checkbox', { name: 'Fondo: igual que el general' }));
    const image = within(row).getByRole('radio', { name: /Imagen \(tope\)/ });
    await user.click(image);
    expect(image).not.toBeChecked();
    expect(within(row).getByRole('radio', { name: /Video corto \(tope\)/ })).toBeInTheDocument();
  });

  it('el tope de 4 videos cuenta el general y bloquea el quinto aunque queden cupos de fondo', async () => {
    const qs = Array.from({ length: 5 }, (_, i) =>
      question(`q${i + 1}`, `Pregunta número ${i + 1}`),
    );
    const own = Object.fromEntries(
      [1, 2, 3].map((n) => [`q${n}`, { background: { kind: 'video', video: video(`v${n}`) } }]),
    );
    const mock = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        [`GET /api/admin/quizzes/${QUIZ_ID}`]: () => json(detail([stage('e', undefined, qs)])),
        [`GET /api/admin/quizzes/${QUIZ_ID}/appearance`]: () =>
          json({
            appearance: {
              ...general,
              background: { kind: 'video', video: video('gen') },
              questions: own,
            },
            rev: 2,
            history: [],
            warnings: [],
          }),
      },
      { session: ADMIN },
    );
    void mock;
    const user = await openTab();
    expect(caps()).toHaveTextContent('Videos (el general cuenta): 4 de 4 (tope)');
    const row = rowOf('Pregunta número 4');
    await user.click(within(row).getByRole('radio', { name: 'Personalizar' }));
    await user.click(within(row).getByRole('checkbox', { name: 'Fondo: igual que el general' }));
    expect(within(row).getByRole('radio', { name: /Video corto \(tope\)/ })).toBeInTheDocument();
    expect(within(row).getByRole('radio', { name: /^Imagen$/ })).toBeInTheDocument();
  });

  it('un fondo elegido sin archivo avisa y bloquea el guardado', async () => {
    setup(TWO_STAGES);
    const user = await openTab();
    const row = rowOf('Elige una puerta.');
    await user.click(within(row).getByRole('radio', { name: 'Personalizar' }));
    await user.click(within(row).getByRole('checkbox', { name: 'Fondo: igual que el general' }));
    await user.click(within(row).getByRole('radio', { name: /Imagen/ }));
    expect(within(row).getByText(/Sube el archivo o elige «Sin fondo»/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar apariencia' })).toBeDisabled();
    await user.click(within(row).getByRole('radio', { name: 'Sin fondo' }));
    expect(screen.getByRole('button', { name: 'Guardar apariencia' })).toBeEnabled();
  });

  it('lista aparte los ajustes de preguntas que ya no existen y «Quitar» los saca del envío', async () => {
    const { called } = setup(TWO_STAGES, {
      fantasma: { accent: '#ff8fb1' },
      p1: { accent: '#5fe3ae' },
    });
    const user = await openTab();
    const alert = screen.getByText('Personalizaciones sin pregunta').closest('div')!.parentElement!;
    expect(within(alert).getByText('fantasma')).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Quitar' }));
    expect(screen.queryByText('Personalizaciones sin pregunta')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Guardar apariencia' }));
    await screen.findByText(/Ya lo ven las lectoras/);
    const sent = (
      called(`PUT /api/admin/quizzes/${QUIZ_ID}/appearance`)[0]?.body as {
        appearance: { questions: Record<string, object> };
      }
    ).appearance.questions;
    expect(Object.keys(sent)).toEqual(['p1']);
  });

  it('la vista previa elige «General» o una pregunta y muestra su texto y el contraste de las personalizadas', async () => {
    setup(TWO_STAGES, { p2: { overlay: { mode: 'manual', strength: 0.9 } } });
    const user = await openTab();
    const preview = screen.getByRole('region', { name: 'Vista previa' });
    const select = within(preview).getByRole('combobox', { name: 'Pantalla' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'General (introducción)',
      'Etapa 1 · Pregunta 1',
      'Etapa 1 · Pregunta 2 · personalizada',
      'Etapa 2 · Pregunta 1',
    ]);
    await user.selectOptions(select, 'p2');
    expect(within(preview).getByText('¿A dónde irías si pudieras irte ya?')).toBeInTheDocument();
    expect(within(preview).getByTestId('quiz-preview')).toHaveStyle({ '--quiz-veil': '0.9' });
    expect(within(preview).getByText('Contraste · Etapa 1 · Pregunta 2')).toBeInTheDocument();
    const list = within(preview).getByRole('region', {
      name: 'Contraste de las preguntas personalizadas',
    });
    expect(within(list).getByText('Etapa 1 · Pregunta 2')).toBeInTheDocument();
    expect(within(list).queryByText('Etapa 1 · Pregunta 1')).toBeNull();
    // Volver al general restablece su velo.
    await user.selectOptions(select, 'general');
    expect(within(preview).getByTestId('quiz-preview')).toHaveStyle({ '--quiz-veil': '0.8' });
  });

  it('con 60 preguntas y textos largos la lista sigue siendo usable (el texto se recorta, no desborda)', async () => {
    const long = 'Una pregunta larguísima '.repeat(20).trim();
    const sixty = Array.from({ length: 60 }, (_, i) => question(`q${i + 1}`, `${i + 1}. ${long}`));
    setup([stage('etapa-1', undefined, sixty)]);
    await openTab();
    expect(screen.getAllByRole('radio', { name: 'Personalizar' })).toHaveLength(60);
    expect(screen.getByText(/^60\. Una pregunta/)).toHaveClass('line-clamp-2');
  });
});
