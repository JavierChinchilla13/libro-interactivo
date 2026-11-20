import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, BOOK_ID, READER, json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const ADMIN = { ...READER, id: '670000000000000000000002', name: 'Marisol', role: 'ADMIN' };
const STAMP = '2026-10-01T15:00:00.000Z';
const hex = (n: number) => n.toString(16).padStart(24, '0');

const adminBook = (over: Record<string, unknown> = {}) => ({
  ...BOOK,
  synopsis: '',
  genres: [],
  purchaseLinks: [],
  showInReaderPanel: false,
  wikiSections: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});
const books = (...list: object[]) => ({ 'GET /api/admin/books': () => json({ books: list }) });
const link = (name: RegExp | string) => screen.queryByRole('link', { name });

describe('«Probar como lector»: quizzes', () => {
  const quiz = (n: number, over: Record<string, unknown> = {}) => ({
    id: hex(100 + n),
    bookId: BOOK_ID,
    slug: `quiz-${n}`,
    order: n,
    title: `[PLACEHOLDER] Quiz ${n}`,
    status: 'published',
    currentVersion: 1,
    allowRetake: true,
    showBreakdown: false,
    updatedAt: STAMP,
    hasUnpublishedChanges: false,
    ...over,
  });
  const listFor = (...quizzes: object[]) => ({
    ...books(adminBook()),
    [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () => json({ quizzes: quizzes }),
  });

  it('la lista ofrece probar lo publicado, con destino en el lector real; un borrador o un archivado no', async () => {
    mockApi(
      listFor(
        quiz(1),
        quiz(2, { status: 'draft', currentVersion: 0 }),
        quiz(3, { status: 'archived' }),
      ),
      { session: ADMIN },
    );
    renderAt('/admin/quizzes');
    await screen.findAllByText('[PLACEHOLDER] Quiz 1');
    const probar = screen.getAllByRole('link', { name: /Probar como lector/ });
    expect(probar.map((a) => a.getAttribute('href'))).toEqual([`/panel/quiz/${hex(101)}`]);
    // El nombre del quiz va oculto para lectores de pantalla (no se ve), como en «Editar».
    expect(probar[0]).toHaveTextContent('Probar como lector [PLACEHOLDER] Quiz 1');
  });

  it('un libro archivado no ofrece probar sus quizzes', async () => {
    mockApi(
      {
        ...books(adminBook({ status: 'archived' })),
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () => json({ quizzes: [quiz(1)] }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/quizzes');
    await screen.findAllByText('[PLACEHOLDER] Quiz 1');
    expect(link(/Probar como lector/)).toBeNull();
  });
});

describe('«Ver el libro como lector»: libros', () => {
  it('la lista lo ofrece para publicado, próximamente y borrador, nunca para un archivado', async () => {
    mockApi(
      books(
        adminBook({ id: hex(1), slug: 'publicado', title: 'Publicado', status: 'published' }),
        adminBook({ id: hex(2), slug: 'proximo', title: 'Próximo', status: 'upcoming', order: 2 }),
        adminBook({ id: hex(3), slug: 'borrador', title: 'Borrador', status: 'draft', order: 3 }),
        adminBook({
          id: hex(4),
          slug: 'archivado',
          title: 'Archivado',
          status: 'archived',
          order: 4,
        }),
      ),
      { session: ADMIN },
    );
    renderAt('/admin/libros');
    await screen.findAllByText('Publicado');
    const links = screen.getAllByRole('link', { name: /Ver el libro como lector/ });
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/panel/libros/publicado',
      '/panel/libros/proximo',
      '/panel/libros/borrador',
    ]);
  });

  it('el formulario lo abre en otra pestaña, con rel seguro; no en un libro archivado', async () => {
    mockApi(
      {
        [`GET /api/admin/books/${BOOK_ID}`]: () => json(adminBook({ status: 'draft' })),
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () => json({ quizzes: [] }),
      },
      { session: ADMIN },
    );
    const first = renderAt(`/admin/libros/${BOOK_ID}`);
    const open = await screen.findByRole('link', { name: /Ver el libro como lector/ });
    expect(open).toHaveAttribute('href', '/panel/libros/libro-1');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    first.unmount();
    vi.unstubAllGlobals();

    mockApi(
      {
        [`GET /api/admin/books/${BOOK_ID}`]: () => json(adminBook({ status: 'archived' })),
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () => json({ quizzes: [] }),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/libros/${BOOK_ID}`);
    await screen.findByRole('heading', { level: 1 });
    expect(link(/Ver el libro como lector/)).toBeNull();
  });
});

describe('«Probar como lector»: capítulos extra', () => {
  const EXTRA = hex(300);
  const extra = (over: Record<string, unknown> = {}) => ({
    id: EXTRA,
    bookId: BOOK_ID,
    slug: 'capitulo',
    title: '[PLACEHOLDER] Capítulo',
    kind: 'text',
    bodyHtml: '<p>x</p>',
    order: 1,
    status: 'published',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  });

  it('la lista lo ofrece para publicados y borradores y no para archivados', async () => {
    mockApi(
      {
        ...books(adminBook()),
        [`GET /api/admin/extras?bookId=${BOOK_ID}`]: () =>
          json({
            extras: [
              extra({ id: hex(301), title: 'Publicado', slug: 'a' }),
              extra({ id: hex(302), title: 'Borrador', slug: 'b', status: 'draft' }),
              extra({ id: hex(303), title: 'Archivado', slug: 'c', status: 'archived' }),
            ],
          }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/extras');
    await screen.findAllByText('Publicado');
    expect(
      screen
        .getAllByRole('link', { name: /Probar como lector/ })
        .map((a) => a.getAttribute('href')),
    ).toEqual([`/panel/extras/${hex(301)}`, `/panel/extras/${hex(302)}`]);
  });

  it('el formulario lo ofrece junto a «Vista previa» (que se conserva) y abre otra pestaña', async () => {
    mockApi(
      { ...books(adminBook()), [`GET /api/admin/extras/${EXTRA}`]: () => json(extra()) },
      { session: ADMIN },
    );
    renderAt(`/admin/extras/${EXTRA}`);
    const open = await screen.findByRole('link', { name: /Probar como lector/ });
    expect(open).toHaveAttribute('href', `/panel/extras/${EXTRA}`);
    expect(open).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: 'Vista previa' })).toBeInTheDocument();
  });

  it('un extra archivado no lo ofrece en el formulario', async () => {
    mockApi(
      {
        ...books(adminBook()),
        [`GET /api/admin/extras/${EXTRA}`]: () => json(extra({ status: 'archived' })),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/extras/${EXTRA}`);
    await screen.findByRole('button', { name: 'Vista previa' });
    expect(link(/Probar como lector/)).toBeNull();
  });
});

describe('«Ver como lector»: cartas (solo ADMIN)', () => {
  const card = (id: string, n: number, status: 'published' | 'archived') => ({
    id,
    bookId: BOOK_ID,
    title: `[PLACEHOLDER] Carta ${n}`,
    order: n,
    status,
    images: [
      {
        publicId: `libro/cartas/AbCdEfGhIjKlMnOpQrSt000${n}`,
        width: 1200,
        height: 1800,
        bytes: 1_000_000,
        format: 'jpg',
        url: `https://res.cloudinary.com/demo/image/upload/x${n}.jpg`,
      },
    ],
    createdAt: STAMP,
    updatedAt: STAMP,
  });

  it('la lista la ofrece solo para las publicadas, con destino a la carta del lector', async () => {
    mockApi(
      {
        ...books(adminBook()),
        [`GET /api/admin/cards?bookId=${BOOK_ID}`]: () =>
          json({ cards: [card(hex(401), 1, 'published'), card(hex(402), 2, 'archived')] }),
        'GET /api/admin/site-settings': () =>
          json({
            welcome: { enabled: false, bodyHtml: '', showMode: 'every_login' },
            universe: { headline: 'x', introHtml: '', headerImages: [] },
            author: { bioHtml: '' },
            social: [],
            lock: { message: 'x' },
          }),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/cartas?libro=${BOOK_ID}`);
    await screen.findAllByText('[PLACEHOLDER] Carta 1');
    expect(
      screen.getAllByRole('link', { name: /Ver como lector/ }).map((a) => a.getAttribute('href')),
    ).toEqual([`/panel/cartas/${hex(401)}`]);
  });
});

describe('«Ver en la wiki»: entradas', () => {
  const entry = (id: string, name: string, status: 'draft' | 'published' | 'archived') => ({
    id,
    kind: 'character',
    slug: name.toLowerCase(),
    name,
    letter: name.charAt(0),
    fields: [],
    links: [],
    lockedDisplay: 'show',
    bookId: BOOK_ID,
    order: 1,
    status,
    createdAt: STAMP,
    updatedAt: STAMP,
  });

  it('la lista la lleva a la ficha con el libro (?libro=); un borrador también, un archivado no', async () => {
    mockApi(
      {
        ...books(adminBook()),
        'GET /api/admin/wiki?kind=character': () =>
          json({
            entries: [
              entry(hex(501), 'Ana', 'published'),
              entry(hex(502), 'Beto', 'draft'),
              entry(hex(503), 'Carla', 'archived'),
            ],
          }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/wiki');
    await screen.findAllByText('Ana');
    const links = screen.getAllByRole('link', { name: /Ver en la wiki/ });
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      `/wiki/entrada/${hex(501)}?libro=libro-1`,
      `/wiki/entrada/${hex(502)}?libro=libro-1`,
    ]);
    expect(links[0]).toHaveTextContent('Ver en la wiki Ana');
  });
});

describe('la wiki del equipo: libros en borrador', () => {
  const entry = (slug: string, id: string, order: number, unpublished?: 'draft' | 'upcoming') => ({
    book: {
      ...BOOK,
      slug,
      id,
      order,
      title: `[PLACEHOLDER] ${slug}`,
      // Un borrador llega con status «upcoming» (el tipo solo admite dos estados).
      status: unpublished ? 'upcoming' : 'published',
    },
    access: 'open',
    ...(unpublished ? { unpublished } : {}),
    progress: { done: 0, total: 0, bookCompleted: false },
  });
  const DRAFT = hex(60);
  const sections = (bookId: string) => ({
    [`GET /api/wiki/sections?bookId=${bookId}`]: () =>
      json({ bookId, sections: [{ kind: 'term', title: 'Glosario', locked: false }] }),
    [`GET /api/wiki/entries?bookId=${bookId}&kind=term`]: () => json({ entries: [] }),
  });

  it('el equipo ve el libro en borrador (de la biblioteca) con el aviso; un lector no', async () => {
    mockApi(
      {
        'GET /api/me/library': () => json({ books: [entry('libro-borrador', DRAFT, 1, 'draft')] }),
        'GET /api/books': () => json({ books: [] }),
        ...sections(DRAFT),
      },
      { session: ADMIN },
    );
    const first = renderAt('/wiki');
    expect(await screen.findByRole('tab', { name: 'Glosario' })).toBeInTheDocument();
    expect(
      screen.getByText('Este libro está en borrador: los lectores no ven esta wiki.'),
    ).toBeInTheDocument();
    first.unmount();
    vi.unstubAllGlobals();

    mockApi({ 'GET /api/books': () => json({ books: [] }) }, { session: READER });
    renderAt('/wiki');
    expect(await screen.findByText('Todavía no hay una wiki disponible.')).toBeInTheDocument();
    expect(screen.queryByText(/está en borrador/)).toBeNull();
  });

  it('un libro «próximamente» para el equipo no lleva aviso (ya es público)', async () => {
    mockApi(
      {
        'GET /api/me/library': () =>
          json({ books: [entry('libro-proximo', DRAFT, 1, 'upcoming')] }),
        ...sections(DRAFT),
      },
      { session: ADMIN },
    );
    renderAt('/wiki');
    await screen.findByRole('tab', { name: 'Glosario' });
    expect(screen.queryByText(/está en borrador/)).toBeNull();
  });
});
