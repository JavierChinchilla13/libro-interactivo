import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const NO_SESSION = { session: null } as const;
const image = (name: string) => ({
  provider: 'cloudinary',
  publicId: `libro/${name}`,
  deliveryType: 'upload',
  url: `https://res.cloudinary.com/demo/image/upload/libro/${name}.png`,
  width: 800,
  height: 600,
  alt: `Imagen ${name}`,
});
const card = (slug: string, over: object = {}) => ({
  id: slug.padStart(24, '0').replace(/[^0-9a-f]/g, '0'),
  slug,
  title: `Título ${slug}`,
  template: 'text',
  category: 'novedad',
  excerpt: `Resumen de ${slug}`,
  publishedAt: '2026-10-01T15:00:00.000Z',
  featured: false,
  ...over,
});
const list = (posts: object[], over: object = {}) => ({
  posts,
  total: posts.length,
  page: 1,
  pageSize: 9,
  ...over,
});
const listKey = (qs = '') => `GET /api/posts?${qs}page=1&pageSize=9`;
const detail = (template: string, data: object, over: object = {}) => ({
  ...card('detalle', { template, title: 'Mi publicación' }),
  data,
  ...over,
});
const detailKey = 'GET /api/posts/detalle';

describe('lista de actualizaciones', () => {
  it('muestra tarjetas con tipo, fecha, resumen y miniatura, más recientes primero', async () => {
    mockApi(
      {
        [listKey()]: () =>
          json(
            list([
              card('uno', { category: 'evento', thumbnail: image('uno') }),
              card('dos', { category: 'invitacion' }),
            ]),
          ),
      },
      NO_SESSION,
    );
    renderAt('/actualizaciones');
    const first = await screen.findByRole('link', { name: /Título uno/ });
    expect(first).toHaveAttribute('href', '/actualizaciones/uno');
    expect(within(first).getByText('Evento')).toBeInTheDocument();
    expect(within(first).getByText('1 de octubre de 2026')).toBeInTheDocument();
    expect(within(first).getByText('Resumen de uno')).toBeInTheDocument();
    expect(within(first).getByRole('img', { name: 'Imagen uno' })).toHaveAttribute(
      'src',
      expect.stringContaining('w_640'),
    );
    expect(screen.getByRole('link', { name: /Título dos/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('el filtro por tipo pide solo ese tipo y queda en la dirección', async () => {
    const { called } = mockApi(
      {
        [listKey()]: () => json(list([card('uno'), card('ev', { category: 'evento' })])),
        [listKey('category=evento&')]: () => json(list([card('ev', { category: 'evento' })])),
      },
      NO_SESSION,
    );
    renderAt('/actualizaciones');
    await screen.findByRole('link', { name: /Título uno/ });
    await userEvent.click(screen.getByRole('button', { name: 'Eventos' }));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Título uno/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /Título ev/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eventos' })).toHaveAttribute('aria-pressed', 'true');
    expect(called(listKey('category=evento&'))).toHaveLength(1);
  });

  it('entrar con ?tipo= ya filtra', async () => {
    mockApi(
      {
        [listKey('category=invitacion&')]: () =>
          json(list([card('inv', { category: 'invitacion' })])),
      },
      NO_SESSION,
    );
    renderAt('/actualizaciones?tipo=invitaciones');
    expect(await screen.findByRole('link', { name: /Título inv/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invitaciones' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('«Cargar más» agrega la página siguiente y desaparece al terminar', async () => {
    mockApi(
      {
        [listKey()]: () => json(list([card('a'), card('b')], { total: 3, pageSize: 2 })),
        'GET /api/posts?page=2&pageSize=9': () => json(list([card('c')], { total: 3, page: 2 })),
      },
      NO_SESSION,
    );
    renderAt('/actualizaciones');
    await screen.findByRole('link', { name: /Título a/ });
    await userEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('link', { name: /Título c/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Título a/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument(),
    );
  });

  it('sin publicaciones lo dice; con error del servidor, lo avisa', async () => {
    mockApi({ [listKey()]: () => json(list([])) }, NO_SESSION);
    const first = renderAt('/actualizaciones');
    expect(
      await screen.findByText('Todavía no hay publicaciones de este tipo.'),
    ).toBeInTheDocument();
    first.unmount();
    mockApi({ [listKey()]: () => apiError('INTERNAL', 'Error', 500) }, NO_SESSION);
    renderAt('/actualizaciones');
    expect(await screen.findByText(/Algo salió mal en el servidor/)).toBeInTheDocument();
  });
});

describe('una plantilla por componente', () => {
  const open = async (template: string, data: object) => {
    mockApi({ [detailKey]: () => json(detail(template, data)) }, NO_SESSION);
    return renderAt('/actualizaciones/detalle');
  };

  it('texto simple: encabezado con el tipo y la fecha, y el cuerpo saneado', async () => {
    const view = await open('text', {
      bodyHtml: '<p>Cuerpo del texto</p><img src=x onerror="alert(1)">',
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mi publicación' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Novedad')).toBeInTheDocument();
    expect(screen.getByText('1 de octubre de 2026')).toBeInTheDocument();
    expect(screen.getByText('Cuerpo del texto')).toBeInTheDocument();
    expect(view.container.querySelector('[onerror]')).toBeNull();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /Actualizaciones/ }),
    ).toHaveAttribute('href', '/actualizaciones');
  });

  it('imagen destacada: imagen ancha con su pie y el texto', async () => {
    await open('featured_image', {
      image: image('grande'),
      caption: 'Pie de la imagen',
      bodyHtml: '<p>Texto</p>',
    });
    const img = await screen.findByRole('img', { name: 'Imagen grande' });
    expect(img).toHaveAttribute('src', expect.stringContaining('w_1200'));
    expect(screen.getByText('Pie de la imagen')).toBeInTheDocument();
  });

  it('galería: cuadrícula de fotos que se amplían con flechas, teclado y pie', async () => {
    await open('gallery', {
      images: [
        { image: image('uno'), caption: 'Pie uno' },
        { image: image('dos'), caption: 'Pie dos' },
        { image: image('tres') },
      ],
    });
    await userEvent.click(await screen.findByRole('button', { name: /Ampliar foto 1: Pie uno/ }));
    const dialog = screen.getByRole('dialog', { name: 'Foto ampliada' });
    expect(within(dialog).getByText('Pie uno')).toBeInTheDocument();
    expect(within(dialog).getByText('1 de 3')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Foto siguiente' }));
    expect(within(dialog).getByText('Pie dos')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('3 de 3')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('1 de 3')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    expect(within(dialog).getByText('3 de 3')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // El foco vuelve a la foto que abrió el visor.
    expect(screen.getByRole('button', { name: /Ampliar foto 1/ })).toHaveFocus();
  });

  it('evento: fecha y hora de Costa Rica, lugar, dirección y enlaces que abren en otra pestaña', async () => {
    await open('event', {
      startsAt: '2027-03-20T22:00:00.000Z',
      endsAt: '2027-03-21T00:00:00.000Z',
      venue: '[PLACEHOLDER] Librería',
      address: '[PLACEHOLDER] Calle 1',
      mapUrl: 'https://maps.example.com/x',
      link: 'https://ejemplo.com/evento',
      bodyHtml: '<p>Detalles</p>',
    });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByText(/20 de marzo de 2027/).length).toBeGreaterThan(0);
    expect(screen.getByText(/4:00/)).toBeInTheDocument();
    expect(screen.getByText(/hasta .*6:00/)).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Librería')).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Calle 1')).toBeInTheDocument();
    const map = screen.getByRole('link', { name: 'Ver mapa' });
    expect(map).toHaveAttribute('href', 'https://maps.example.com/x');
    expect(map).toHaveAttribute('target', '_blank');
    expect(map).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByRole('link', { name: 'Más información' })).toHaveAttribute(
      'href',
      'https://ejemplo.com/evento',
    );
    expect(screen.getByText('Detalles')).toBeInTheDocument();
  });

  it('invitación: imagen, texto, botón con su texto y fecha límite', async () => {
    await open('invitation', {
      bodyHtml: '<p>Estás invitada</p>',
      image: image('invita'),
      ctaLabel: 'Confirmar asistencia',
      ctaUrl: 'https://ejemplo.com/confirmar',
      deadline: '2027-03-10T18:00:00.000Z',
    });
    expect(await screen.findByRole('link', { name: 'Confirmar asistencia' })).toHaveAttribute(
      'href',
      'https://ejemplo.com/confirmar',
    );
    expect(screen.getByText(/Fecha límite: .*10 de marzo de 2027/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Imagen invita' })).toBeInTheDocument();
  });

  it('una invitación sin botón completo no muestra un botón roto', async () => {
    await open('invitation', { bodyHtml: '<p>Solo texto</p>', ctaLabel: 'Sin enlace' });
    await screen.findByText('Solo texto');
    expect(screen.queryByRole('link', { name: 'Sin enlace' })).not.toBeInTheDocument();
  });

  it('anuncio de un extra: aclara que se desbloquea al completar el libro y lleva a los extras', async () => {
    await open('announcement', { announces: 'extra', ctaLabel: 'Ir a los extras' });
    expect(await screen.findByText('Capítulo extra')).toBeInTheDocument();
    expect(screen.getByText('Se desbloquea al completar todo el libro.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a los extras' })).toHaveAttribute(
      'href',
      '/panel/extras',
    );
  });

  it('anuncio de un libro nuevo: lleva a la página principal y su botón dice «Ver ahora» por defecto', async () => {
    await open('announcement', { announces: 'book' });
    expect(await screen.findByText('Libro nuevo')).toBeInTheDocument();
    expect(screen.queryByText(/se desbloquea/i)).not.toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Ver ahora' });
    expect(cta).toHaveAttribute('href', '/');
  });

  it('datos dañados no tumban la página', async () => {
    mockApi(
      { [detailKey]: () => json(detail('event', { startsAt: 12, venue: { raro: true } })) },
      NO_SESSION,
    );
    renderAt('/actualizaciones/detalle');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mi publicación' }),
    ).toBeInTheDocument();
  });

  it('una publicación que no existe (o aún no es pública) muestra el aviso', async () => {
    mockApi(
      { 'GET /api/posts/nada': () => apiError('NOT_FOUND', 'No encontramos esa publicación', 404) },
      NO_SESSION,
    );
    renderAt('/actualizaciones/nada');
    expect(await screen.findByText('No encontramos esa publicación.')).toBeInTheDocument();
  });
});

describe('destacadas en la landing', () => {
  const featuredKey = 'GET /api/posts?featured=true&page=1&pageSize=3';
  const base = {
    'GET /api/site': () =>
      json({ universe: { introHtml: '' }, author: { bioHtml: '' }, social: [], lockMessage: 'x' }),
    'GET /api/books': () => json({ books: [] }),
  };

  it('muestra las destacadas con «Ver todas las actualizaciones»', async () => {
    mockApi(
      { ...base, [featuredKey]: () => json(list([card('uno', { featured: true })])) },
      NO_SESSION,
    );
    renderAt('/');
    const section = await screen.findByRole('region', { name: 'Actualizaciones' });
    expect(await within(section).findByRole('link', { name: /Título uno/ })).toBeInTheDocument();
    expect(
      within(section).getByRole('link', { name: 'Ver todas las actualizaciones' }),
    ).toHaveAttribute('href', '/actualizaciones');
  });

  it('sin destacadas la sección no aparece', async () => {
    mockApi({ ...base, [featuredKey]: () => json(list([])) }, NO_SESSION);
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Actualizaciones' })).toBeNull(),
    );
  });

  it('el menú público lleva a las actualizaciones', async () => {
    mockApi(base, NO_SESSION);
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Actualizaciones' })).toHaveAttribute(
      'href',
      '/actualizaciones',
    );
  });
});
