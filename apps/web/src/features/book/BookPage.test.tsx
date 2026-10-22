import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, json, mockApi, renderAt } from '../../test/mockApi';

const cover = {
  provider: 'cloudinary',
  publicId: 'libro/c',
  deliveryType: 'upload',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/c.png',
  width: 600,
  height: 900,
  alt: 'Portada del libro 1',
};
const detail = {
  id: '670000000000000000000010',
  slug: 'libro-1',
  title: '[PLACEHOLDER] Libro 1',
  tagline: '[PLACEHOLDER] Lema',
  order: 1,
  status: 'published',
  cover,
  synopsis: '<p>[PLACEHOLDER] Sinopsis completa</p><p>Segundo párrafo</p>',
  genres: ['Distopía'],
  contentWarning: '<p>[PLACEHOLDER] Violencia</p>',
  minAge: 16,
  isbn: '978-0-00',
  purchaseLinks: [
    { region: 'INTL', kind: 'amazon', label: 'Comprar en Amazon', url: 'https://amazon.com/x' },
  ],
  wikiTabs: [],
  experiences: [],
};

describe('/libros/:slug (página mínima del libro)', () => {
  it('muestra portada, título, lema, sinopsis completa y dónde conseguirlo', async () => {
    mockApi({ 'GET /api/books/libro-1': () => json(detail) }, { session: null });
    renderAt('/libros/libro-1');
    expect(
      await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Libro 1' }),
    ).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Lema')).toBeInTheDocument();
    // La página sí muestra la sinopsis completa (la tarjeta de la portada solo un adelanto).
    expect(screen.getByText('Segundo párrafo')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Portada del libro 1' })).toBeInTheDocument();
    const buy = screen.getByRole('region', { name: 'Dónde conseguirlo' });
    expect(within(buy).getByRole('link', { name: /Comprar en Amazon/ })).toHaveAttribute(
      'href',
      'https://amazon.com/x',
    );
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('conserva la advertencia de contenido, la edad, el ISBN y los géneros de la tarjeta', async () => {
    mockApi({ 'GET /api/books/libro-1': () => json(detail) }, { session: null });
    renderAt('/libros/libro-1');
    const warning = await screen.findByLabelText('Advertencia de contenido sensible');
    expect(warning).toHaveTextContent('[PLACEHOLDER] Violencia');
    expect(warning).toHaveTextContent('Recomendado para mayores de 16 años.');
    expect(screen.getByText('ISBN: 978-0-00')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Géneros' })).toHaveTextContent('Distopía');
  });

  it('ofrece crear la cuenta (o continuar la lectura si ya hay sesión)', async () => {
    mockApi({ 'GET /api/books/libro-1': () => json(detail) }, { session: null });
    const visitor = renderAt('/libros/libro-1');
    expect(
      await screen.findByRole('link', { name: 'Tengo el libro: crear mi cuenta' }),
    ).toHaveAttribute('href', '/registro');
    visitor.unmount();
    mockApi({ 'GET /api/books/libro-1': () => json(detail) });
    renderAt('/libros/libro-1');
    expect(await screen.findByRole('link', { name: 'Continuar mi lectura' })).toHaveAttribute(
      'href',
      '/panel',
    );
  });

  it('si el libro no carga ofrece reintentar', async () => {
    let calls = 0;
    mockApi(
      {
        'GET /api/books/libro-1': () => {
          calls += 1;
          return calls === 1 ? apiError('INTERNAL', 'Error', 500) : json(detail);
        },
      },
      { session: null },
    );
    renderAt('/libros/libro-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Libro 1' }),
    ).toBeInTheDocument();
  });

  it('un libro que no existe da la página de «no encontrada»', async () => {
    mockApi(
      { 'GET /api/books/no-existe': () => apiError('NOT_FOUND', 'No encontrado', 404) },
      { session: null },
    );
    renderAt('/libros/no-existe');
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });
});
