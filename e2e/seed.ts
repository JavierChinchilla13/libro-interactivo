import { expect, type APIRequestContext } from '@playwright/test';

/** Prepara por API (con la sesión de la administradora) un libro publicado con un quiz publicado. */
export async function seedPublishedQuiz(
  api: APIRequestContext,
  stamp: number,
  options: { bookOrder?: number } = {},
) {
  const cover = {
    provider: 'cloudinary',
    publicId: 'libro/e2e',
    url: 'https://res.cloudinary.com/demo/image/upload/libro/e2e',
    width: 100,
    height: 100,
    alt: 'Portada',
  };
  const bookTitle = `Libro QR ${stamp}`;
  const bookResponse = await api.post('/api/admin/books', {
    data: {
      slug: `libro-qr-${stamp}`,
      title: bookTitle,
      synopsis: '',
      order: options.bookOrder ?? 1,
      status: 'published',
      cover,
    },
  });
  expect(bookResponse.status(), await bookResponse.text()).toBe(201);
  const book = await bookResponse.json();
  const quiz = await (
    await api.post('/api/admin/quizzes', {
      data: { bookId: book.id, slug: 'quiz-1', order: 1, title: 'Quiz con código' },
    })
  ).json();
  const answers = (q: string) => [
    { id: `${q}a`, text: 'Respuesta A', resultKey: 'r1' },
    { id: `${q}b`, text: 'Respuesta B', resultKey: 'r2' },
  ];
  await api.put(`/api/admin/quizzes/${quiz.id}/draft`, {
    data: {
      title: 'Quiz con código',
      instructionsHtml: '',
      settings: { allowRetake: true, showBreakdown: false },
      stages: [
        {
          id: 'etapa-1',
          order: 1,
          producesFinal: true,
          questions: [{ id: 'p1', text: '¿Cuál?', answers: answers('p1') }],
        },
      ],
      results: [
        { key: 'r1', stageId: 'etapa-1', title: 'Resultado A' },
        { key: 'r2', stageId: 'etapa-1', title: 'Resultado B' },
      ],
    },
  });
  const published = await api.post(`/api/admin/quizzes/${quiz.id}/publish`);
  expect(published.status()).toBe(201);
  return { bookId: book.id as string, bookTitle, quizId: quiz.id as string };
}
