import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const NO_SESSION = { session: null } as const;
const cover = {
  provider: 'cloudinary',
  publicId: 'libro/c',
  deliveryType: 'upload',
  url: 'https://res.cloudinary.com/demo/image/upload/libro/c.png',
  width: 600,
  height: 900,
  alt: 'Portada del libro 1',
};
const site = {
  universe: {
    headline: '[PLACEHOLDER] Frase del universo',
    introHtml: '<p>[PLACEHOLDER] Presentación</p><img src=x onerror="alert(1)">',
  },
  author: {
    name: '[PLACEHOLDER] Autora',
    bioHtml: '<p>[PLACEHOLDER] Bio</p>',
    publicEmail: 'autora@ejemplo.com',
  },
  social: [{ label: 'Instagram', url: 'https://instagram.com/placeholder' }],
  lockMessage: '[PLACEHOLDER] Sigue leyendo',
};
const summary = (over: object) => ({
  id: '670000000000000000000010',
  slug: 'libro-1',
  title: '[PLACEHOLDER] Libro 1',
  order: 1,
  status: 'published',
  cover,
  ...over,
});
const detail = {
  ...summary({}),
  synopsis: '<p>[PLACEHOLDER] Sinopsis</p>',
  genres: ['Distopía', 'Aventura'],
  contentWarning: '<p>[PLACEHOLDER] Violencia</p>',
  minAge: 16,
  isbn: '978-0-00',
  purchaseLinks: [
    { region: 'CR', kind: 'whatsapp', label: 'Escribir por WhatsApp', url: 'https://wa.me/506' },
    { region: 'CR', kind: 'store', label: 'Compras presenciales', notes: 'En cada sede' },
    { region: 'INTL', kind: 'amazon', label: 'Comprar en Amazon', url: 'https://amazon.com/x' },
  ],
  wikiTabs: [
    {
      kind: 'character',
      title: 'Personajes',
      locked: true,
      lockedMessage: '[PLACEHOLDER] Tras el Quiz 2',
    },
    { kind: 'power_field', title: 'Poderes', locked: true },
    { kind: 'term', title: 'Glosario', locked: false },
  ],
  experiences: [
    { kind: 'quiz', id: '670000000000000000000021', order: 1, title: '[PLACEHOLDER] Quiz uno' },
    { kind: 'quiz', id: '670000000000000000000022', order: 2, title: '[PLACEHOLDER] Quiz dos' },
  ],
};
const books = {
  books: [
    summary({}),
    summary({
      id: '670000000000000000000011',
      slug: 'libro-2',
      title: '[PLACEHOLDER] Libro 2',
      order: 2,
      status: 'upcoming',
      releaseDate: '2027-03-01',
    }),
  ],
};
// El libro destacado es el publicado más reciente: aquí solo el 1 está publicado.
const full = {
  'GET /api/site': () => json(site),
  'GET /api/books': () => json(books),
  'GET /api/books/libro-1': () => json(detail),
};

describe('landing: sin contenido cargado', () => {
  it('muestra la portada con textos [PLACEHOLDER] y omite lo que no existe', async () => {
    mockApi(
      {
        'GET /api/site': () =>
          json({
            universe: { introHtml: '' },
            author: { bioHtml: '' },
            social: [],
            lockMessage: 'x',
          }),
        'GET /api/books': () => json({ books: [] }),
      },
      NO_SESSION,
    );
    renderAt('/');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '[PLACEHOLDER] Frase principal del sitio',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] ¿Qué es el universo Memorias?')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Conoce el libro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wiki del universo' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /experiencia inmersiva/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Pronto publicaremos dónde conseguir/)).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Nombre de la autora')).toBeInTheDocument();
  });

  it('sigue mostrándose aunque el API de ajustes falle', async () => {
    mockApi(
      {
        'GET /api/site': () => apiError('INTERNAL', 'Error', 500),
        'GET /api/books': () => json({ books: [] }),
      },
      NO_SESSION,
    );
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Frase principal del sitio/ }),
    ).toBeInTheDocument();
  });
});

describe('landing: con contenido', () => {
  it('muestra la frase, el libro, la advertencia con la edad y el ISBN, sin ejecutar HTML ajeno', async () => {
    mockApi(full, NO_SESSION);
    const { container } = renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Frase del universo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Presentación')).toBeInTheDocument();
    expect(container.querySelector('[onerror]')).toBeNull();

    const book = await screen.findByRole('region', { name: '[PLACEHOLDER] Libro 1' });
    expect(within(book).getByRole('list', { name: 'Géneros' })).toHaveTextContent(
      'DistopíaAventura',
    );
    expect(within(book).getByText('[PLACEHOLDER] Sinopsis')).toBeInTheDocument();
    const warning = within(book).getByLabelText('Advertencia de contenido sensible');
    expect(warning).toHaveTextContent('[PLACEHOLDER] Violencia');
    expect(warning).toHaveTextContent('Recomendado para mayores de 16 años.');
    expect(within(book).getByText('ISBN: 978-0-00')).toBeInTheDocument();
    expect(within(book).getByRole('img', { name: 'Portada del libro 1' })).toHaveAttribute(
      'src',
      expect.stringContaining('/upload/f_auto,q_auto,w_480/'),
    );
  });

  it('la wiki muestra las pestañas bloqueadas con su mensaje (o el general) y la abierta sin candado', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const wiki = await screen.findByRole('region', { name: 'Wiki del universo' });
    const items = within(wiki).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Personajes');
    expect(items[0]).toHaveTextContent('Bloqueado');
    expect(items[0]).toHaveTextContent('[PLACEHOLDER] Tras el Quiz 2');
    // Sin mensaje propio usa el texto general de bloqueo de la autora.
    expect(items[1]).toHaveTextContent('[PLACEHOLDER] Sigue leyendo');
    expect(items[2]).toHaveTextContent('Glosario');
    expect(items[2]).toHaveTextContent('Abierto para todos');
    expect(items[2]).not.toHaveTextContent('Bloqueado');
  });

  it('las experiencias muestran solo el nombre y «bloqueado»; con sesión remiten al panel', async () => {
    mockApi(full, NO_SESSION);
    const visitor = renderAt('/');
    const section = await screen.findByRole('region', { name: /experiencia inmersiva/ });
    expect(within(section).getAllByText('[PLACEHOLDER] Sigue leyendo')).toHaveLength(2);
    expect(within(section).getByText('[PLACEHOLDER] Quiz dos')).toBeInTheDocument();
    expect(within(section).queryByRole('link', { name: 'Ver mi avance' })).not.toBeInTheDocument();
    visitor.unmount();

    mockApi(full);
    renderAt('/');
    const signedIn = await screen.findByRole('region', { name: /experiencia inmersiva/ });
    expect(await within(signedIn).findByRole('link', { name: 'Ver mi avance' })).toHaveAttribute(
      'href',
      '/panel',
    );
  });

  it('la secuencia marca «Próximamente» con la fecha y «Publicado» al ya disponible', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const saga = await screen.findByRole('region', { name: 'Secuencia de publicación' });
    const [one, two] = within(saga).getAllByRole('listitem');
    expect(one).toHaveTextContent('Publicado');
    expect(two).toHaveTextContent('Próximamente');
    expect(two).toHaveTextContent('1 de marzo de 2027');
  });

  it('cómo comprar separa Costa Rica e internacional; los enlaces abren en otra pestaña y sin enlace es solo texto', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const buy = await screen.findByRole('region', { name: 'Cómo comprar el libro' });
    expect(await within(buy).findByRole('heading', { name: 'Costa Rica' })).toBeInTheDocument();
    expect(within(buy).getByRole('heading', { name: 'Internacional' })).toBeInTheDocument();
    const whatsapp = within(buy).getByRole('link', { name: 'Escribir por WhatsApp' });
    expect(whatsapp).toHaveAttribute('href', 'https://wa.me/506');
    expect(whatsapp).toHaveAttribute('target', '_blank');
    expect(whatsapp).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(
      within(buy).queryByRole('link', { name: 'Compras presenciales' }),
    ).not.toBeInTheDocument();
    expect(within(buy).getByText('En cada sede')).toBeInTheDocument();
    expect(within(buy).getByRole('link', { name: 'Comprar en Amazon' })).toHaveAttribute(
      'href',
      'https://amazon.com/x',
    );
  });

  it('muestra a la autora con su correo y redes, y las redes también en el pie', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const author = await screen.findByRole('region', { name: 'Conoce a la autora' });
    expect(await within(author).findByText('[PLACEHOLDER] Autora')).toBeInTheDocument();
    expect(within(author).getByRole('link', { name: 'autora@ejemplo.com' })).toHaveAttribute(
      'href',
      'mailto:autora@ejemplo.com',
    );
    expect(within(author).getByRole('link', { name: 'Instagram' })).toBeInTheDocument();
    const footerLinks = within(screen.getByRole('list', { name: 'Redes sociales' }));
    expect(footerLinks.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'rel',
      expect.stringContaining('noopener'),
    );
  });
});

describe('formulario de contacto', () => {
  const fill = async () => {
    await userEvent.type(await screen.findByLabelText(/Nombre completo/), 'Ana Lector');
    await userEvent.type(screen.getByLabelText(/Correo electrónico/), 'ana@ejemplo.com');
    await userEvent.type(screen.getByLabelText(/^Mensaje/), 'Hola, me encantó el primer libro.');
  };

  it('valida por campo y no llama al API si algo está mal', async () => {
    const { called } = mockApi({}, NO_SESSION);
    renderAt('/contacto');
    await userEvent.type(await screen.findByLabelText(/Correo electrónico/), 'no-es-correo');
    await userEvent.type(screen.getByLabelText(/^Mensaje/), 'corto');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(await screen.findByText('Escribe tu nombre')).toBeInTheDocument();
    expect(screen.getByText(/al menos 10 caracteres/)).toBeInTheDocument();
    expect(called('POST /api/contact')).toHaveLength(0);
  });

  it('envía los datos con el campo trampa vacío y la hora de inicio, y confirma', async () => {
    const { called } = mockApi(
      { 'POST /api/contact': () => json({ message: 'ok' }, 202) },
      NO_SESSION,
    );
    renderAt('/contacto');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(await screen.findByText('Gracias, recibimos tu mensaje.')).toBeInTheDocument();
    const [call] = called('POST /api/contact');
    expect(call?.body).toMatchObject({
      name: 'Ana Lector',
      email: 'ana@ejemplo.com',
      message: 'Hola, me encantó el primer libro.',
      website: '',
    });
    expect((call?.body as { startedAt: number }).startedAt).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Enviar mensaje' })).not.toBeInTheDocument();
  });

  it('el campo trampa no se ve ni se alcanza con el teclado, pero viaja si un bot lo llena', async () => {
    const { called } = mockApi(
      { 'POST /api/contact': () => json({ message: 'ok' }, 202) },
      NO_SESSION,
    );
    renderAt('/contacto');
    await fill();
    const trap = document.querySelector<HTMLInputElement>('input[name="website"]');
    expect(trap).not.toBeNull();
    expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(trap?.tabIndex).toBe(-1);
    await userEvent.type(trap as HTMLInputElement, 'http://spam.example');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    await waitFor(() => expect(called('POST /api/contact')).toHaveLength(1));
    expect(called('POST /api/contact')[0]?.body).toMatchObject({ website: 'http://spam.example' });
  });

  it('muestra el aviso de demasiados intentos y conserva lo escrito', async () => {
    mockApi(
      { 'POST /api/contact': () => apiError('RATE_LIMITED', 'Demasiados intentos', 429) },
      NO_SESSION,
    );
    renderAt('/contacto');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(await screen.findByText('Demasiados intentos. Espera un momento.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre completo/)).toHaveValue('Ana Lector');
  });
});
