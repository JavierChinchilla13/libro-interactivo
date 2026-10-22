import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../test/mockApi';

// jsdom no implementa `<dialog>` modal: se simula lo que importa (abrir y cerrar cambian el atributo `open`).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(() => vi.unstubAllGlobals());

const review = (n: number) => ({
  id: `6700000000000000000000${40 + n}`,
  text: `[PLACEHOLDER] Reseña número ${n}`,
  authorName: `[PRUEBA] Lectora ${n}`,
  order: n,
  rating: 5,
});
const site = { universe: { introHtml: '' }, author: { bioHtml: '' }, social: [], lockMessage: 'x' };

function mount(shown: number, all = 9) {
  const calls: string[] = [];
  mockApi(
    {
      'GET /api/site': () => json(site),
      'GET /api/books': () => json({ books: [] }),
      'GET /api/reviews?limit=6': () =>
        json({ reviews: Array.from({ length: shown }, (_, i) => review(i + 1)) }),
      'GET /api/reviews?limit=50': () => {
        calls.push('50');
        return json({ reviews: Array.from({ length: all }, (_, i) => review(i + 1)) });
      },
    },
    { session: null },
  );
  renderAt('/');
  return calls;
}

describe('panel con todas las reseñas', { timeout: 30_000 }, () => {
  it('con 3 o menos reseñas no hay botón', async () => {
    mount(3);
    await screen.findByRole('region', { name: 'Reseñas de lectores' });
    expect(screen.queryByRole('button', { name: 'Ver todas las reseñas' })).not.toBeInTheDocument();
  });

  it('con más de 3 el botón abre un diálogo con todas (se piden al abrir, hasta 50)', async () => {
    const calls = mount(5, 9);
    const button = await screen.findByRole('button', { name: 'Ver todas las reseñas' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(calls).toEqual([]);
    await userEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Reseñas de lectores' });
    const list = await within(dialog).findByRole('list', { name: 'Todas las reseñas' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(9);
    expect(calls).toEqual(['50']);
    // Texto plano con la misma tarjeta de la portada.
    expect(list.querySelector('.review-frame .review-card blockquote')).not.toBeNull();
  });

  it('se cierra con el botón, con Escape y con un toque fuera, y el foco vuelve al botón', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    mount(5);
    const button = await screen.findByRole('button', { name: 'Ver todas las reseñas' });

    // Botón «Cerrar»
    await userEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Reseñas de lectores' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(dialog).not.toHaveAttribute('open');
    expect(button).toHaveFocus();

    // Escape (el navegador lo avisa con el evento `cancel`)
    await userEvent.click(button);
    expect(dialog).toHaveAttribute('open');
    act(() => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(dialog).not.toHaveAttribute('open');
    expect(button).toHaveFocus();

    // Toque fuera del panel (sobre el fondo): el clic llega al propio diálogo, fuera de su caja
    dialog.getBoundingClientRect = () =>
      ({ left: 100, right: 500, top: 100, bottom: 500 }) as DOMRect;
    await userEvent.click(button);
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(dialog).not.toHaveAttribute('open');
    // Un toque dentro no lo cierra
    await userEvent.click(button);
    fireEvent.click(dialog, { clientX: 200, clientY: 200 });
    expect(dialog).toHaveAttribute('open');
  });

  it('al abrirse el foco va al botón «Cerrar» y, si falla la carga, se puede reintentar', async () => {
    mockApi(
      {
        'GET /api/site': () => json(site),
        'GET /api/books': () => json({ books: [] }),
        'GET /api/reviews?limit=6': () => json({ reviews: [1, 2, 3, 4].map(review) }),
        'GET /api/reviews?limit=50': () => json({ error: { code: 'INTERNAL', message: 'x' } }, 500),
      },
      { session: null },
    );
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Ver todas las reseñas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reseñas de lectores' });
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    expect(await within(dialog).findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
