import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOK_ID, apiError, json, mockApi, renderAt } from '../../test/mockApi';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const NO_SESSION = { session: null } as const;
const image = (name: string) => ({
  provider: 'cloudinary',
  publicId: `libro/${name}`,
  deliveryType: 'upload',
  url: `https://res.cloudinary.com/demo/image/upload/libro/${name}.png`,
  width: 400,
  height: 400,
  alt: `Imagen ${name}`,
});
const SECTIONS = {
  bookId: BOOK_ID,
  sections: [
    {
      kind: 'character',
      title: 'Personajes',
      locked: true,
      lockedMessage: '[PLACEHOLDER] Tras el Quiz 2',
    },
    { kind: 'power_field', title: 'Poderes', locked: true },
    {
      kind: 'place',
      title: 'Lugares',
      locked: false,
      introHtml: '<p>[PLACEHOLDER] Mensaje de lugares</p>',
      mapImage: image('mapa'),
    },
    { kind: 'term', title: 'Glosario', locked: false },
  ],
};
const open = (id: string, kind: string, name: string, over: object = {}) => ({
  locked: false,
  id: id.padStart(24, '0'),
  kind,
  slug: name.toLowerCase(),
  name,
  letter: name.charAt(0).toUpperCase(),
  order: 1,
  ...over,
});
const lockedItem = (id: string, kind: string) => ({
  locked: true,
  id: id.padStart(24, '0'),
  kind,
  order: 9,
});
const entriesKey = (kind: string) => `GET /api/wiki/entries?bookId=${BOOK_ID}&kind=${kind}`;
const SECTIONS_KEY = `GET /api/wiki/sections?bookId=${BOOK_ID}`;
const base = { [SECTIONS_KEY]: () => json(SECTIONS) };

describe('wiki: pestañas', () => {
  it('un visitante ve las pestañas con regla bloqueadas y, en la bloqueada, solo el mensaje y cómo ingresar', async () => {
    const { calls } = mockApi(base, NO_SESSION);
    renderAt('/wiki');
    const tabs = await screen.findByRole('tablist', { name: 'Secciones de la wiki' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['🔒 Personajes', '🔒 Poderes', 'Lugares', 'Glosario']);
    // La primera pestaña es la bloqueada: mensaje de la autora y un solo camino, sin pedir contenido.
    expect(await screen.findByText('[PLACEHOLDER] Tras el Quiz 2')).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Ingresar' }),
    ).toHaveAttribute('href', '/ingresar');
    expect(calls.filter((c) => c.url.includes('/api/wiki/entries'))).toHaveLength(0);
  });

  it('con sesión, la pestaña bloqueada ofrece ir al panel; sin mensaje propio usa el texto general', async () => {
    mockApi(base);
    renderAt('/wiki/poderes');
    expect(await screen.findByText('Se habilita al avanzar en tu lectura.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute(
      'href',
      '/panel',
    );
  });

  it('cambiar de pestaña cambia la dirección', async () => {
    mockApi({ ...base, [entriesKey('term')]: () => json({ entries: [] }) }, NO_SESSION);
    const view = renderAt('/wiki');
    await userEvent.click(await screen.findByRole('tab', { name: 'Glosario' }));
    expect(await screen.findByText('Todavía no hay términos publicados.')).toBeInTheDocument();
    expect(view.container).toBeTruthy();
  });

  it('si el servidor responde «no desbloqueado» a una pestaña que se veía abierta, muestra el bloqueo', async () => {
    mockApi(
      {
        ...base,
        [entriesKey('place')]: () => apiError('NOT_UNLOCKED', 'Aún no puedes acceder', 403),
      },
      NO_SESSION,
    );
    renderAt('/wiki/lugares');
    expect(await screen.findByText('🔒 Bloqueado')).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Ingresar' }),
    ).toBeInTheDocument();
  });

  it('sin libro publicado o sin pestañas lo dice', async () => {
    mockApi({ 'GET /api/books': () => json({ books: [] }) }, NO_SESSION);
    renderAt('/wiki');
    expect(await screen.findByText('Todavía no hay una wiki disponible.')).toBeInTheDocument();
  });
});

describe('wiki: lugares', () => {
  const places = {
    entries: [
      open('1', 'place', 'Sala', {
        group: 'Sala de experimentación',
        image: image('sala'),
        summary: 'Un lugar',
      }),
      open('2', 'place', 'Ciudad Vieja', { group: 'Ciudad' }),
      lockedItem('3', 'place'),
    ],
  };

  it('muestra el mensaje, el mapa, la lista y una tarjeta bloqueada sin nombre', async () => {
    mockApi({ ...base, [entriesKey('place')]: () => json(places) }, NO_SESSION);
    renderAt('/wiki/lugares');
    expect(await screen.findByText('[PLACEHOLDER] Mensaje de lugares')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Imagen mapa' })).toHaveAttribute(
      'src',
      expect.stringContaining('w_1200'),
    );
    const sala = await screen.findByRole('link', { name: /Sala/ });
    expect(sala).toHaveAttribute('href', `/wiki/entrada/${'1'.padStart(24, '0')}`);
    expect(screen.getAllByText('Bloqueado')).toHaveLength(1);
  });

  it('filtra por tipo y oculta las tarjetas bloqueadas (no tienen tipo)', async () => {
    mockApi({ ...base, [entriesKey('place')]: () => json(places) }, NO_SESSION);
    renderAt('/wiki/lugares');
    await screen.findByRole('link', { name: /Sala/ });
    await userEvent.click(screen.getByRole('button', { name: 'Ciudad' }));
    expect(screen.getByRole('link', { name: /Ciudad Vieja/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sala/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByRole('link', { name: /Sala/ })).toBeInTheDocument();
  });
});

describe('wiki: glosario', () => {
  const terms = {
    entries: [
      open('1', 'term', 'Alfa'),
      open('2', 'term', 'Átomo', { letter: 'A' }),
      open('3', 'term', 'Beta'),
      lockedItem('4', 'term'),
    ],
  };

  it('busca mientras se escribe sin distinguir acentos y atenúa las letras sin términos', async () => {
    mockApi({ ...base, [entriesKey('term')]: () => json(terms) }, NO_SESSION);
    renderAt('/wiki/glosario');
    await screen.findByRole('link', { name: /Alfa/ });
    expect(screen.getByRole('button', { name: 'A' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'B' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'C' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '#' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Buscar un término'), 'ATOMO');
    expect(screen.getByRole('link', { name: /Átomo/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Alfa/ })).not.toBeInTheDocument();
    // Buscando no se muestran tarjetas bloqueadas: no pueden coincidir con nada visible.
    expect(screen.queryByText('Bloqueado')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Buscar un término'));
    await userEvent.type(screen.getByLabelText('Buscar un término'), 'zzz');
    expect(screen.getByText('No encontramos términos con esa búsqueda.')).toBeInTheDocument();
  });

  it('filtra por letra y se puede quitar el filtro', async () => {
    mockApi({ ...base, [entriesKey('term')]: () => json(terms) }, NO_SESSION);
    renderAt('/wiki/glosario');
    await screen.findByRole('link', { name: /Beta/ });
    expect(screen.getByText('Bloqueado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('link', { name: /Alfa/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Beta/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(screen.getByRole('link', { name: /Alfa/ })).toBeInTheDocument();
  });
});

describe('wiki: poderes y personajes', () => {
  it('cada campo trae sus poderes; uno bloqueado se ve sin datos y un campo bloqueado es una tarjeta', async () => {
    const handlers = {
      [SECTIONS_KEY]: () =>
        json({
          bookId: BOOK_ID,
          sections: [{ kind: 'power_field', title: 'Poderes', locked: false }],
        }),
      [entriesKey('power_field')]: () =>
        json({
          entries: [
            {
              ...open('1', 'power_field', 'Campo A', { image: image('campo') }),
              powers: [
                open('11', 'power', 'Poder Uno', { summary: 'Hace algo' }),
                lockedItem('12', 'power'),
              ],
            },
            lockedItem('2', 'power_field'),
          ],
        }),
    };
    mockApi(handlers);
    renderAt('/wiki/poderes');
    expect(await screen.findByRole('link', { name: 'Campo A' })).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Poderes conocidos \(2\)/));
    expect(screen.getByRole('link', { name: 'Poder Uno' })).toHaveAttribute(
      'href',
      `/wiki/entrada/${'11'.padStart(24, '0')}`,
    );
    expect(screen.getByText('🔒 Bloqueado')).toBeInTheDocument();
    expect(screen.getAllByText('Bloqueado').length).toBeGreaterThan(0);
  });

  it('los personajes abiertos muestran sus tarjetas', async () => {
    mockApi({
      [SECTIONS_KEY]: () =>
        json({
          bookId: BOOK_ID,
          sections: [
            {
              kind: 'character',
              title: 'Personajes',
              locked: false,
              introHtml: '<p>Intro abierta</p>',
            },
          ],
        }),
      [entriesKey('character')]: () =>
        json({ entries: [open('1', 'character', 'Ana', { image: image('ana') })] }),
    });
    renderAt('/wiki/personajes');
    expect(await screen.findByText('Intro abierta')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Ana/ })).toBeInTheDocument();
  });
});

describe('wiki: ficha de una entrada', () => {
  const id = '5'.padStart(24, '0');

  it('muestra la ficha con el texto saneado, los datos y lo relacionado (lo bloqueado sin nombre)', async () => {
    mockApi(
      {
        [`GET /api/wiki/entries/${id}`]: () =>
          json({
            entry: {
              id,
              kind: 'place',
              slug: 'sala',
              name: 'Sala',
              group: 'Sala de experimentación',
              summary: 'Un lugar',
              bodyHtml: '<p>Texto</p><img src=x onerror="alert(1)">',
              image: image('sala'),
              fields: [{ label: 'Piso', value: '3' }],
            },
            related: [open('7', 'term', 'Alfa'), lockedItem('8', 'character')],
          }),
      },
      NO_SESSION,
    );
    const { container } = renderAt(`/wiki/entrada/${id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sala' })).toBeInTheDocument();
    expect(screen.getByText('Texto')).toBeInTheDocument();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(screen.getByText('Piso')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alfa' })).toHaveAttribute(
      'href',
      `/wiki/entrada/${'7'.padStart(24, '0')}`,
    );
    expect(screen.getByText('🔒 Bloqueado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a la wiki/ })).toHaveAttribute(
      'href',
      '/wiki/lugares',
    );
  });

  it('una entrada bloqueada (403) muestra el aviso y nada más; una inexistente (404), que no existe', async () => {
    mockApi(
      {
        [`GET /api/wiki/entries/${id}`]: () =>
          apiError('NOT_UNLOCKED', 'Aún no puedes acceder', 403),
      },
      NO_SESSION,
    );
    const first = renderAt(`/wiki/entrada/${id}`);
    expect(await screen.findByText('Esta entrada está bloqueada')).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Ingresar' }),
    ).toBeInTheDocument();
    first.unmount();

    mockApi(
      {
        [`GET /api/wiki/entries/${id}`]: () =>
          apiError('NOT_FOUND', 'No encontramos esa entrada', 404),
      },
      NO_SESSION,
    );
    renderAt(`/wiki/entrada/${id}`);
    expect(await screen.findByText('No encontramos esa entrada.')).toBeInTheDocument();
  });
});

describe('wiki: accesos desde el sitio', () => {
  it('el menú y la landing llevan a la wiki', async () => {
    mockApi(
      {
        'GET /api/site': () =>
          json({
            universe: { introHtml: '' },
            author: { bioHtml: '' },
            social: [],
            lockMessage: 'x',
          }),
        'GET /api/books/libro-1': () =>
          json({
            id: BOOK_ID,
            slug: 'libro-1',
            title: '[PLACEHOLDER] Libro 1',
            order: 1,
            status: 'published',
            synopsis: '',
            genres: [],
            purchaseLinks: [],
            wikiTabs: [{ kind: 'term', title: 'Glosario', locked: false }],
            experiences: [],
          }),
      },
      NO_SESSION,
    );
    renderAt('/');
    expect(
      within(await screen.findByRole('navigation', { name: 'Principal' })).getByRole('link', {
        name: 'Wiki',
      }),
    ).toHaveAttribute('href', '/wiki');
    const wiki = await screen.findByRole('region', { name: 'Wiki del universo' });
    await waitFor(() =>
      expect(within(wiki).getByRole('link', { name: 'Entrar a la wiki' })).toHaveAttribute(
        'href',
        '/wiki',
      ),
    );
  });
});
