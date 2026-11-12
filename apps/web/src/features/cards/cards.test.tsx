import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../test/mockApi';

// jsdom no trae el diálogo modal: se simula lo justo (abrir, cerrar y el evento `close`).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* sin almacenamiento */
  }
});
afterEach(() => vi.unstubAllGlobals());

const BOOK = '670000000000000000000010';
const ID_A = '670000000000000000000091';
const ID_B = '670000000000000000000092';
const url = (name: string, width = 480) =>
  `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_${width}/libro/cartas/${name}`;

const summary = (over: Record<string, unknown> = {}) => ({
  id: ID_A,
  bookId: BOOK,
  bookTitle: '[PLACEHOLDER] Libro 1',
  title: '[PLACEHOLDER] Carta A',
  alt: '[PLACEHOLDER] Carta A, imagen 1 de 3',
  imageUrl: url('portada-a'),
  width: 1200,
  height: 1800,
  imageCount: 3,
  ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
  id: ID_A,
  bookId: BOOK,
  bookTitle: '[PLACEHOLDER] Libro 1',
  title: '[PLACEHOLDER] Carta A',
  images: [1, 2, 3].map((n) => ({
    url: url(`imagen-${n}`, 1200),
    alt: n === 2 ? 'Un mapa antiguo' : `[PLACEHOLDER] Carta A, imagen ${n} de 3`,
    width: 1200,
    height: 1800,
  })),
  ...over,
});
const list = (cards: unknown[], extra: Record<string, unknown> = {}) => ({
  'GET /api/cards': () => json({ cards, testMode: false, ...extra }),
});

describe('«Cartas» de la lectora', () => {
  it('con nada abierto no muestra ninguna carta ni cuántas hay, y dice cómo abrir la primera', async () => {
    mockApi({ ...list([]) });
    renderAt('/panel/cartas');
    expect(await screen.findByRole('heading', { level: 1, name: 'Hallazgos' })).toBeInTheDocument();
    expect(
      await screen.findByText(/Todavía no has abierto nada en «Hallazgos»/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Hallazgos' })).toBeNull();
    expect(screen.queryByText(/bloqueada/i)).toBeNull();
    expect(document.title).toBe('Hallazgos · Universo Memorias');
  });

  it('solo las abiertas, en cuadrícula con portada y título; con varias imágenes dice cuántas, sin dar sus direcciones', async () => {
    mockApi({
      ...list([
        summary(),
        summary({
          id: ID_B,
          title: '[PLACEHOLDER] Carta B',
          alt: '[PLACEHOLDER] Carta B',
          imageUrl: url('portada-b'),
          imageCount: 1,
        }),
      ]),
    });
    const { container } = renderAt('/panel/cartas');
    const grid = await screen.findByRole('list', { name: 'Hallazgos' });
    const tiles = within(grid).getAllByRole('link');
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAttribute('href', `/panel/cartas/${ID_A}`);
    expect(within(tiles[0]!).getByRole('img')).toHaveAttribute('src', url('portada-a'));
    expect(within(tiles[0]!).getByText('3 imágenes')).toBeInTheDocument();
    expect(within(tiles[1]!).queryByText(/imágenes/)).toBeNull();
    // Ninguna otra imagen de la carta está en la página.
    expect(container.innerHTML).not.toContain('imagen-2');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('modo prueba para una administradora: lo avisa', async () => {
    mockApi({ ...list([summary()], { testMode: true }) });
    renderAt('/panel/cartas');
    expect(await screen.findByText('Modo prueba')).toBeInTheDocument();
  });

  it('con CARDS_SHOW_LOCKED encendido dibuja las que faltan como bloqueadas, sin título ni imagen', async () => {
    mockApi({ ...list([summary()], { locked: 2 }) });
    renderAt('/panel/cartas');
    const grid = await screen.findByRole('list', { name: 'Hallazgos' });
    expect(within(grid).getAllByRole('img', { name: 'Todavía bloqueada' })).toHaveLength(2);
    expect(within(grid).getAllByRole('link')).toHaveLength(1);
  });

  it('el nombre que eligió la autora está en el menú, en el título y en el vacío; el de siempre es «Hallazgos»', async () => {
    mockApi({
      ...list([]),
      'GET /api/site': () =>
        json({
          universe: { introHtml: '' },
          author: { bioHtml: '' },
          social: [],
          lockMessage: 'x',
          cardsLabel: 'Reliquias',
        }),
    });
    renderAt('/panel/cartas');
    expect(await screen.findByRole('heading', { level: 1, name: 'Reliquias' })).toBeInTheDocument();
    const menu = screen.getAllByRole('navigation', { name: 'Panel' })[0]!;
    expect(within(menu).getByRole('link', { name: 'Reliquias' })).toHaveAttribute(
      'href',
      '/panel/cartas',
    );
    expect(within(menu).queryByRole('link', { name: 'Hallazgos' })).toBeNull();
    expect(
      await screen.findByText(/Todavía no has abierto nada en «Reliquias»/),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Reliquias · Universo Memorias'));
  });

  it('sin cambiar nada el menú dice «Hallazgos» y resalta la pestaña al estar dentro', async () => {
    mockApi({ ...list([]) });
    renderAt('/panel/cartas');
    const menu = (await screen.findAllByRole('navigation', { name: 'Panel' }))[0]!;
    expect(within(menu).getByRole('link', { name: 'Hallazgos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('vista grande: galería accesible', () => {
  const open = () =>
    mockApi({
      ...list([summary()]),
      [`GET /api/cards/${ID_A}`]: () => json(detail()),
    });

  it('al tocar una carta se abre un diálogo con su título, su libro y la primera imagen: «1 de 3»', async () => {
    open();
    renderAt('/panel/cartas');
    await userEvent.click(await screen.findByRole('link', { name: '[PLACEHOLDER] Carta A' }));
    const dialog = await screen.findByRole('dialog', { name: '[PLACEHOLDER] Carta A' });
    expect(within(dialog).getByText('[PLACEHOLDER] Libro 1')).toBeInTheDocument();
    const image = await within(dialog).findByRole('img', {
      name: '[PLACEHOLDER] Carta A, imagen 1 de 3',
    });
    expect(image).toHaveAttribute('src', url('imagen-1', 1200));
    const counter = within(dialog).getByRole('status');
    expect(counter).toHaveTextContent('1 de 3');
    expect(counter).toHaveAttribute('aria-live', 'polite');
    expect(
      within(dialog).getByRole('group', { name: 'Imágenes de «[PLACEHOLDER] Carta A»' }),
    ).toHaveAttribute('aria-roledescription', 'galería');
    // Sin las demás imágenes a la vista: una a la vez.
    expect(within(dialog).getAllByRole('img')).toHaveLength(1);
  });

  it('las flechas ‹ › cambian de imagen, el contador sigue y en los extremos quedan apagadas (aria-disabled)', async () => {
    open();
    renderAt(`/panel/cartas/${ID_A}`);
    const dialog = await screen.findByRole('dialog');
    const prev = await within(dialog).findByRole('button', { name: 'Imagen anterior' });
    const next = within(dialog).getByRole('button', { name: 'Imagen siguiente' });
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveAttribute('aria-disabled', 'false');

    await userEvent.click(next);
    expect(within(dialog).getByRole('img', { name: 'Un mapa antiguo' })).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 de 3');
    await userEvent.click(next);
    expect(within(dialog).getByRole('status')).toHaveTextContent('3 de 3');
    expect(next).toHaveAttribute('aria-disabled', 'true');
    // En el último, «siguiente» no hace nada.
    await userEvent.click(next);
    expect(within(dialog).getByRole('status')).toHaveTextContent('3 de 3');
    await userEvent.click(prev);
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 de 3');
  });

  it('con el teclado: flechas, Inicio y Fin', async () => {
    open();
    renderAt(`/panel/cartas/${ID_A}`);
    const dialog = await screen.findByRole('dialog');
    const gallery = await within(dialog).findByRole('group');
    const press = (key: string) => fireEvent.keyDown(gallery, { key });
    press('ArrowRight');
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 de 3');
    press('End');
    expect(within(dialog).getByRole('status')).toHaveTextContent('3 de 3');
    press('ArrowRight');
    expect(within(dialog).getByRole('status')).toHaveTextContent('3 de 3');
    press('ArrowLeft');
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 de 3');
    press('Home');
    expect(within(dialog).getByRole('status')).toHaveTextContent('1 de 3');
    press('x');
    expect(within(dialog).getByRole('status')).toHaveTextContent('1 de 3');
    // También con el foco en «Cerrar» (donde cae al abrir), no solo sobre la galería.
    const close = within(dialog).getByRole('button', { name: 'Cerrar' });
    close.focus();
    fireEvent.keyDown(close, { key: 'ArrowRight' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 de 3');
  });

  it('deslizar con el dedo: a la izquierda avanza, a la derecha retrocede; un gesto vertical o corto no cambia nada', async () => {
    open();
    renderAt(`/panel/cartas/${ID_A}`);
    const dialog = await screen.findByRole('dialog');
    const image = await within(dialog).findByRole('img');
    const stage = image.parentElement!;
    const swipe = (from: [number, number], to: [number, number], ms = 120) => {
      fireEvent.pointerDown(stage, {
        clientX: from[0],
        clientY: from[1],
        isPrimary: true,
        timeStamp: 0,
      });
      fireEvent.pointerUp(stage, {
        clientX: to[0],
        clientY: to[1],
        isPrimary: true,
        timeStamp: ms,
      });
    };
    swipe([200, 100], [80, 105]);
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 de 3');
    swipe([80, 100], [200, 100]);
    expect(within(dialog).getByRole('status')).toHaveTextContent('1 de 3');
    swipe([100, 100], [110, 100]); // muy corto
    swipe([100, 100], [100, 300]); // vertical
    swipe([200, 100], [120, 220]); // diagonal, más vertical que horizontal
    expect(within(dialog).getByRole('status')).toHaveTextContent('1 de 3');
    // Un gesto rápido y corto también cuenta.
    swipe([200, 100], [170, 100], 40);
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 de 3');
  });

  it('una carta con una sola imagen no ofrece flechas ni contador', async () => {
    mockApi({
      ...list([summary({ imageCount: 1 })]),
      [`GET /api/cards/${ID_A}`]: () => json(detail({ images: [detail().images[0]] })),
    });
    renderAt(`/panel/cartas/${ID_A}`);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('img');
    expect(
      within(dialog).queryByRole('button', { name: /Imagen (anterior|siguiente)/ }),
    ).toBeNull();
    expect(within(dialog).queryByRole('status')).toBeNull();
    expect(within(dialog).queryByRole('group')).toBeNull();
  });

  it('cerrar con el botón (o con Escape, que cierra el diálogo) vuelve a la lista', async () => {
    open();
    renderAt('/panel/cartas');
    await userEvent.click(await screen.findByRole('link', { name: '[PLACEHOLDER] Carta A' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('img');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('list', { name: 'Hallazgos' })).toBeInTheDocument();

    // Escape: el navegador cierra el diálogo y avisa con el evento `close`.
    await userEvent.click(screen.getByRole('link', { name: '[PLACEHOLDER] Carta A' }));
    const second = await screen.findByRole('dialog');
    await within(second).findByRole('img');
    (second as HTMLDialogElement).close();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('si se llegó a la carta por otro lado (el QR, un enlace), cerrar lleva a la lista y no a la página anterior', async () => {
    open();
    renderAt(`/panel/cartas/${ID_A}`);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('img');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('list', { name: 'Hallazgos' })).toBeInTheDocument();
  });

  it('una carta que no abrió (o que no existe) dice lo mismo: escanea el código; no filtra nada', async () => {
    mockApi({
      ...list([]),
      [`GET /api/cards/${ID_A}`]: () =>
        json({ error: { code: 'NOT_FOUND', message: 'No encontramos esa carta' } }, 404),
    });
    renderAt(`/panel/cartas/${ID_A}`);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/No encontramos esto en tu cuenta/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('img')).toBeNull();
  });

  it('con «reducir movimiento» la galería no declara animaciones propias en línea (las apaga la hoja de estilos)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    open();
    renderAt(`/panel/cartas/${ID_A}`);
    const dialog = await screen.findByRole('dialog');
    const image = await within(dialog).findByRole('img');
    // Sin estilos en línea de movimiento: toda la animación vive en `cards.css`, dentro de `prefers-reduced-motion`.
    expect(image.getAttribute('style')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Imagen siguiente' }));
    expect(within(dialog).getByRole('img').getAttribute('style')).toBeNull();
  });
});

describe('canje del QR de una carta (/u/:token)', () => {
  const info = {
    valid: true,
    bookTitle: '[PLACEHOLDER] Libro 1',
    kind: 'card',
    title: 'Una carta',
  };
  const redeemed = {
    kind: 'card',
    refId: ID_A,
    bookId: BOOK,
    title: '[PLACEHOLDER] Carta A',
    alreadyUnlocked: false,
  };

  it('con sesión la abre y ofrece verla de una vez en la sección', async () => {
    mockApi({
      'GET /api/access/resolve/abc.def': () => json(info),
      'POST /api/access/redeem': () => json(redeemed),
    });
    renderAt('/u/abc.def');
    expect(await screen.findByText('¡Desbloqueado!')).toBeInTheDocument();
    const see = screen.getByRole('link', { name: 'Ver «[PLACEHOLDER] Carta A»' });
    expect(see).toHaveAttribute('href', `/panel/cartas/${ID_A}`);
    expect(screen.getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute('href', '/panel');
  });

  it('sin sesión NO dice el título de la carta: solo que hay algo nuevo en la sección', async () => {
    mockApi(
      {
        'GET /api/access/resolve/abc.def': () => json(info),
        'GET /api/site': () =>
          json({
            universe: { introHtml: '' },
            author: { bioHtml: '' },
            social: [],
            lockMessage: 'x',
            cardsLabel: 'Reliquias',
          }),
      },
      { session: null },
    );
    renderAt('/u/abc.def');
    expect(await screen.findByText('[PLACEHOLDER] Libro 1')).toBeInTheDocument();
    expect(await screen.findByText(/Algo nuevo para «(Hallazgos|Reliquias)»/)).toBeInTheDocument();
    expect(screen.queryByText('Una carta')).toBeNull();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Ingresar' }),
    ).toBeInTheDocument();
  });
});
