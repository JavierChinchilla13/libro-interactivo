import { screen, within } from '@testing-library/react';
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
  genres: [],
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

  it('un libro que no existe da la página de «no encontrada»', async () => {
    mockApi(
      { 'GET /api/books/no-existe': () => apiError('NOT_FOUND', 'No encontrado', 404) },
      { session: null },
    );
    renderAt('/libros/no-existe');
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });
});
