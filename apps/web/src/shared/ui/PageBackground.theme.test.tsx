import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSelectedBookId } from '../../features/reader/bookSelection';
import { PALETTE, contrast, isUsableBackground, isUsablePrimary } from '../lib/color';
import { json, mockApi, renderAt } from '../../test/mockApi';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const image = (publicId: string) => ({
  provider: 'cloudinary',
  publicId,
  url: `https://res.cloudinary.com/demo/image/upload/${publicId}`,
  width: 2000,
  height: 2000,
  alt: '',
  deliveryType: 'upload',
});

const site = (background?: unknown) => ({
  universe: { introHtml: '', ...(background ? { background } : {}) },
  author: { bioHtml: '' },
  social: [],
  lockMessage: 'Bloqueado',
});

const book = (theme: unknown, over: Record<string, unknown> = {}) => ({
  id: '670000000000000000000010',
  slug: 'libro-1',
  title: '[PLACEHOLDER] Libro 1',
  order: 1,
  status: 'published',
  ...(theme ? { theme } : {}),
  ...over,
});

const render = (books: unknown[], siteBackground?: unknown) => {
  mockApi({
    'GET /api/site': () => json(site(siteBackground)),
    'GET /api/books': () => json({ books }),
  });
  return renderAt('/contacto');
};

const root = () => document.documentElement.style;

describe('contraste (utilidad)', () => {
  it('conoce los extremos y la paleta del sitio', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#e8f5ff', '#06142b')).toBeGreaterThan(10);
  });
});

describe('tema por libro', () => {
  it('la imagen de fondo del libro reemplaza la pintura del sitio', async () => {
    const { container } = render(
      [book({ background: { type: 'image', image: image('libro/tema') } })],
      image('libro/sitio'),
    );
    await waitFor(() => expect(container.querySelector('.page-bg img')).not.toBeNull());
    expect(container.querySelector('.page-bg img')?.getAttribute('src')).toContain('libro/tema');
  });

  it('un color de fondo y un color primario con buen contraste se aplican y se quitan al salir', async () => {
    const view = render([
      book({ primaryColor: '#7fe0ff', background: { type: 'color', color: '#101a3a' } }),
    ]);
    await waitFor(() => expect(root().getPropertyValue('--token-bg')).toBe('#101a3a'));
    expect(root().getPropertyValue('--token-primary')).toBe('#7fe0ff');
    // Sin pintura: el fondo de color manda sobre la del sitio.
    expect(view.container.querySelector('.page-bg')).toBeNull();
    view.unmount();
    expect(root().getPropertyValue('--token-bg')).toBe('');
    expect(root().getPropertyValue('--token-primary')).toBe('');
  });

  it('un fondo claro o un primario con poco contraste se ignoran: el sitio conserva su paleta', async () => {
    render(
      [book({ primaryColor: '#111111', background: { type: 'color', color: '#f5f5f5' } })],
      image('libro/sitio'),
    );
    await screen.findByRole('heading', { name: /contacto/i });
    await waitFor(() => expect(document.querySelector('.page-bg img')).not.toBeNull());
    expect(root().getPropertyValue('--token-bg')).toBe('');
    expect(root().getPropertyValue('--token-primary')).toBe('');
  });

  it('sin tema no cambia nada, y con varios libros manda el elegido en este navegador', async () => {
    localStorage.setItem('libro_selected_book', '670000000000000000000011');
    render([
      book({ background: { type: 'image', image: image('libro/uno') } }, { order: 2 }),
      book(
        { background: { type: 'image', image: image('libro/dos') } },
        { id: '670000000000000000000011', slug: 'libro-2', order: 1 },
      ),
    ]);
    await waitFor(() => expect(document.querySelector('.page-bg img')).not.toBeNull());
    expect(document.querySelector('.page-bg img')?.getAttribute('src')).toContain('libro/dos');
  });
});

describe('qué colores del tema se aceptan', () => {
  it('el fondo debe dejar leer también el texto atenuado, no solo el principal', () => {
    // Un gris medio deja leer el texto principal (≥ 4,5) pero no el atenuado: se rechaza.
    expect(contrast('#606060', PALETTE.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#606060', PALETTE.muted)).toBeLessThan(4.5);
    expect(isUsableBackground('#606060')).toBe(false);
    expect(isUsableBackground('#101a3a')).toBe(true);
    expect(isUsableBackground('#f5f5f5')).toBe(false);
  });

  it('el primario debe leerse como texto sobre el fondo y sobre las tarjetas y aguantar texto oscuro encima', () => {
    expect(isUsablePrimary('#7fe0ff')).toBe(true);
    // Muy oscuro: no se lee sobre el fondo; muy claro y apagado: el texto oscuro del botón no se lee.
    expect(isUsablePrimary('#223355')).toBe(false);
    expect(isUsablePrimary('#3a5a8a')).toBe(false);
    expect(isUsablePrimary('not-a-color')).toBe(false);
  });
});

describe('libro activo', () => {
  it('al cambiar de libro en el panel el tema cambia sin recargar, y en la portada manda el destacado', async () => {
    const books = [
      book({ background: { type: 'image', image: image('libro/uno') } }, { order: 1 }),
      book(
        { background: { type: 'image', image: image('libro/dos') } },
        { id: '670000000000000000000011', slug: 'libro-2', order: 2 },
      ),
    ];
    render(books);
    // Sin elección: en la portada y las páginas públicas manda el destacado (mayor orden).
    await waitFor(() =>
      expect(document.querySelector('.page-bg img')?.getAttribute('src')).toContain('libro/dos'),
    );
    act(() => setSelectedBookId('670000000000000000000010'));
    await waitFor(() =>
      expect(document.querySelector('.page-bg img')?.getAttribute('src')).toContain('libro/uno'),
    );
  });

  it('no se pide ninguna imagen hasta saber qué libro está activo (no hay dos descargas)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockApi({
      'GET /api/site': () => json(site(image('libro/sitio'))),
      'GET /api/books': async () => {
        await gate;
        return json({
          books: [book({ background: { type: 'image', image: image('libro/tema') } })],
        });
      },
    });
    renderAt('/contacto');
    await screen.findByRole('heading', { name: /contacto/i });
    expect(document.querySelector('.page-bg')).toBeNull();
    release();
    await waitFor(() =>
      expect(document.querySelector('.page-bg img')?.getAttribute('src')).toContain('libro/tema'),
    );
  });
});
