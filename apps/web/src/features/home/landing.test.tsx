import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { READER, apiError, json, mockApi, renderAt } from '../../test/mockApi';

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
    { kind: 'quiz', order: 1 },
    { kind: 'quiz', order: 2 },
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
        name: 'Universo Memorias',
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('[PLACEHOLDER] ¿Qué es el universo Memorias?'),
    ).toBeInTheDocument();
    // Las secciones se montan tras el primer pintado del héroe.
    expect(await screen.findByText(/Pronto publicaremos dónde conseguir/)).toBeInTheDocument();
    expect(await screen.findByText('[PLACEHOLDER] Nombre de la autora')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wiki del universo' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /experiencia inmersiva/ }),
    ).not.toBeInTheDocument();
  });

  it('si falla el API de ajustes muestra el nombre del universo (no un borrador) y permite reintentar', async () => {
    let calls = 0;
    const { called } = mockApi(
      {
        'GET /api/site': () => {
          calls += 1;
          return calls === 1 ? apiError('INTERNAL', 'Error', 500) : json(site);
        },
        'GET /api/books': () => json({ books: [] }),
      },
      NO_SESSION,
    );
    renderAt('/');
    // Primero espera el aviso: así el título ya no es el de «cargando».
    expect(await screen.findByText('No pudimos cargar todo el contenido')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Universo Memorias' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Frase principal del sitio/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Frase del universo' }),
    ).toBeInTheDocument();
    expect(called('GET /api/site')).toHaveLength(2);
  });
});

describe('landing: el héroe lleva al libro en la mano', () => {
  it('sin sesión la acción principal es crear la cuenta; «Comprar» vive en la cabecera', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const hero = await screen.findByRole('region', { name: /Frase del universo/ });
    expect(
      within(hero).getByRole('link', { name: 'Tengo el libro: crear mi cuenta' }),
    ).toHaveAttribute('href', '/registro');
    expect(within(hero).getByRole('link', { name: 'Ya tengo cuenta' })).toHaveAttribute(
      'href',
      '/ingresar',
    );
    // Titular, presentación, dos acciones y la salida para quien aún no tiene el libro: nada más.
    expect(within(hero).getAllByRole('link')).toHaveLength(3);
    expect(
      within(hero).getByRole('link', { name: 'Aún no lo tengo: dónde conseguirlo' }),
    ).toHaveAttribute('href', '#comprar');
    expect(within(hero).queryByText(/Escanea el código QR/)).not.toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Comprar' })).toHaveAttribute(
      'href',
      '/#comprar',
    );
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Cómo comprar' })).toHaveAttribute(
      'href',
      '/#comprar',
    );
  });

  it('el héroe va a la izquierda con la rejilla debajo; la portada vive en la ficha del libro', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const hero = await screen.findByRole('region', { name: /Frase del universo/ });
    expect(within(hero).queryByRole('img', { name: /Portada/ })).not.toBeInTheDocument();
    expect(hero.className).not.toContain('text-center');
    expect(hero.querySelector('.hero-copy h1')).not.toBeNull();
    const book = await screen.findByRole('region', { name: '[PLACEHOLDER] Libro 1' });
    expect(within(book).getByRole('img', { name: 'Portada del libro 1' })).toBeInTheDocument();
  });

  it('con sesión la acción principal es continuar la lectura y no ofrece crear cuenta', async () => {
    mockApi(full);
    renderAt('/');
    const hero = await screen.findByRole('region', { name: /Frase del universo/ });
    expect(within(hero).getByRole('link', { name: 'Continuar mi lectura' })).toHaveAttribute(
      'href',
      '/panel',
    );
    expect(
      within(hero).queryByRole('link', { name: 'Tengo el libro: crear mi cuenta' }),
    ).not.toBeInTheDocument();
  });

  it('las acciones se ven de inmediato y pasan a «Continuar mi lectura» al saber que hay sesión', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi({
      ...full,
      'GET /api/me': async () => {
        await gate;
        return json({ user: READER });
      },
    });
    renderAt('/');
    const hero = await screen.findByRole('region', { name: /Frase del universo/ });
    // Sin esperar a la sesión (en un servidor lento no se deja al visitante sin botones).
    expect(
      within(hero).getByRole('link', { name: 'Tengo el libro: crear mi cuenta' }),
    ).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Ya tengo cuenta' })).toBeInTheDocument();
    release();
    expect(
      await within(hero).findByRole('link', { name: 'Continuar mi lectura' }),
    ).toBeInTheDocument();
    expect(
      within(hero).queryByRole('link', { name: 'Tengo el libro: crear mi cuenta' }),
    ).not.toBeInTheDocument();
  });

  it('el héroe aparece sin esperar a los libros y las secciones entran después', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi(
      {
        ...full,
        'GET /api/books': async () => {
          await gate;
          return json(books);
        },
      },
      NO_SESSION,
    );
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: '[PLACEHOLDER] Frase del universo' }),
    ).toBeInTheDocument();
    // Mientras tanto: relleno de las secciones, ninguna sección ni su contenido.
    expect(screen.getByRole('status', { name: 'Cargando el contenido' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wiki del universo' })).not.toBeInTheDocument();
    release();
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Libro 1' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Cargando el contenido' })).not.toBeInTheDocument();
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
      expect.stringContaining('/upload/f_auto,q_auto,w_640/'),
    );
  });

  it('la wiki muestra las pestañas bloqueadas con su mensaje (o el general) y la abierta sin candado', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const wiki = await screen.findByRole('region', { name: 'Wiki del universo' });
    const items = within(wiki).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Personajes');
    // Cada renglón del índice lleva a su pestaña de la wiki.
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', '/wiki/personajes');
    expect(within(items[2]!).getByRole('link')).toHaveAttribute('href', '/wiki/glosario');
    expect(items[0]).toHaveTextContent('Bloqueado');
    expect(items[0]).toHaveTextContent('[PLACEHOLDER] Tras el Quiz 2');
    // Sin mensaje propio no repite el texto general en la tarjeta: se dice una sola vez bajo la lista.
    expect(items[1]).toHaveTextContent('Bloqueado');
    expect(items[1]).not.toHaveTextContent('[PLACEHOLDER] Sigue leyendo');
    expect(within(wiki).getAllByText('[PLACEHOLDER] Sigue leyendo')).toHaveLength(1);
    expect(items[2]).toHaveTextContent('Glosario');
    expect(items[2]).toHaveTextContent('Abierto para todos');
    expect(items[2]).not.toHaveTextContent('Bloqueado');
  });

  it('las experiencias muestran solo su tipo y posición (nunca el título) y «bloqueado»; con sesión remiten al panel', async () => {
    mockApi(full, NO_SESSION);
    const visitor = renderAt('/');
    const section = await screen.findByRole('region', { name: /experiencia inmersiva/ });
    expect(within(section).getAllByText('[PLACEHOLDER] Sigue leyendo')).toHaveLength(1);
    expect(within(section).getByText('Se abre con el QR de tu libro')).toBeInTheDocument();
    expect(within(section).getByText('Antes, completa el Quiz 1')).toBeInTheDocument();
    expect(within(section).getByText('Experiencia 1')).toBeInTheDocument();
    expect(within(section).getByText('Quiz 2')).toBeInTheDocument();
    expect(within(section).queryByText(/Quiz uno|Quiz dos/)).not.toBeInTheDocument();
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

  it('cierra con la acción principal y cambia con la sesión', async () => {
    mockApi(full, NO_SESSION);
    const visitor = renderAt('/');
    const closing = await screen.findByRole('region', { name: 'Empieza con tu libro' });
    expect(
      within(closing).getByRole('link', { name: 'Tengo el libro: crear mi cuenta' }),
    ).toHaveAttribute('href', '/registro');
    expect(within(closing).getByText(/escanéalo y empieza por el primer quiz/)).toBeInTheDocument();
    visitor.unmount();

    mockApi(full);
    renderAt('/');
    const signedIn = await screen.findByRole('region', { name: 'Empieza con tu libro' });
    expect(await within(signedIn).findByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute(
      'href',
      '/panel',
    );
    expect(within(signedIn).getByText('Tu avance te espera en el panel.')).toBeInTheDocument();
    expect(
      within(signedIn).queryByRole('link', { name: 'Tengo el libro: crear mi cuenta' }),
    ).not.toBeInTheDocument();
  });

  it('el nombre de cada experiencia («Quiz 2», «Juego») va en la letra de texto', async () => {
    mockApi(
      {
        ...full,
        'GET /api/books/libro-1': () =>
          json({
            ...detail,
            experiences: [
              { kind: 'quiz', order: 1 },
              { kind: 'game', order: 2 },
            ],
          }),
      },
      NO_SESSION,
    );
    renderAt('/');
    const section = await screen.findByRole('region', { name: /experiencia inmersiva/ });
    expect(within(section).getByText('Quiz 1').className).not.toContain('font-display');
    expect(within(section).getByText('Juego').className).not.toContain('font-display');
  });

  it('con un solo libro no hay secuencia de publicación', async () => {
    mockApi(
      {
        ...full,
        'GET /api/books': () => json({ books: [summary({})] }),
      },
      NO_SESSION,
    );
    renderAt('/');
    await screen.findByRole('region', { name: 'Wiki del universo' });
    expect(
      screen.queryByRole('region', { name: 'Secuencia de publicación' }),
    ).not.toBeInTheDocument();
  });

  it('un libro sin portada, sinopsis ni lema no abre una ficha vacía ni su enlace', async () => {
    mockApi(
      {
        ...full,
        'GET /api/books/libro-1': () =>
          json({ ...detail, cover: undefined, synopsis: '', tagline: undefined }),
      },
      NO_SESSION,
    );
    renderAt('/');
    await screen.findByRole('region', { name: 'Wiki del universo' });
    expect(
      screen.queryByRole('region', { name: /\[PLACEHOLDER\] Libro 1/ }),
    ).not.toBeInTheDocument();
  });

  it('el inicio no lleva carril de lectura ni numerales: el hilo solo marca estado en las experiencias', async () => {
    mockApi(full, NO_SESSION);
    const { container } = renderAt('/');
    await screen.findByRole('region', { name: 'Wiki del universo' });
    expect(container.querySelector('.page-rail, .section-node, .section-numeral')).toBeNull();
    // Los únicos puntos del hilo son los de la lista de experiencias.
    expect(container.querySelectorAll('[data-thread]')).toHaveLength(0);
    const experiences = screen.getByRole('region', { name: /experiencia inmersiva/ });
    expect(within(experiences).getAllByRole('listitem')).toHaveLength(2);
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
    // El formulario ya no vive en la portada: solo la invitación a la página de contacto.
    expect(within(author).queryByLabelText(/Nombre completo/)).not.toBeInTheDocument();
    expect(within(author).getByRole('link', { name: 'Escríbele a la autora' })).toHaveAttribute(
      'href',
      '/contacto',
    );
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

describe('landing: composición nueva', () => {
  it('«Qué es» enlaza cada verbo con lo que ya existe', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const about = await screen.findByRole('region', { name: 'Qué es Universo Memorias' });
    expect(about.querySelector('.statement')).toHaveTextContent(
      'Una saga que se lee, se descubre y se juega.',
    );
    const lee = within(about).getByRole('link', { name: /Se lee/ });
    expect(lee).toHaveAttribute('href', '#libro');
    expect(within(about).getByRole('link', { name: /Se descubre/ })).toHaveAttribute(
      'href',
      '#experiencias',
    );
    expect(within(about).getByRole('link', { name: /Se juega/ })).toHaveTextContent('el juego');
  });

  it('el libro destacado lleva a su página y a «Dónde conseguirlo»', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const book = await screen.findByRole('region', { name: '[PLACEHOLDER] Libro 1' });
    expect(within(book).getByRole('link', { name: 'Ver el libro' })).toHaveAttribute(
      'href',
      '/libros/libro-1',
    );
    expect(within(book).getByRole('link', { name: 'Dónde conseguirlo' })).toHaveAttribute(
      'href',
      '#comprar',
    );
  });

  it('«Cómo comprar» va justo después del libro y ofrece cada opción como botón', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const buy = await screen.findByRole('region', { name: 'Cómo comprar el libro' });
    const book = screen.getByRole('region', { name: '[PLACEHOLDER] Libro 1' });
    expect(book.compareDocumentPosition(buy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(buy).getByRole('link', { name: /Comprar en Amazon/ })).toHaveAttribute(
      'href',
      'https://amazon.com/x',
    );
    expect(within(buy).getByText('En cada sede')).toBeInTheDocument();
  });

  it('las experiencias son un mosaico con una celda por experiencia', async () => {
    mockApi(full, NO_SESSION);
    renderAt('/');
    const section = await screen.findByRole('region', { name: /experiencia inmersiva/ });
    const cards = section.querySelectorAll('.exp-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('data-state', 'lit');
    expect(cards[1]).toHaveAttribute('data-state', 'locked');
  });

  it('sin opciones de compra no hay botón «Dónde conseguirlo» (en producción) y sin libro «Qué es» no enlaza a él', async () => {
    vi.stubEnv('DEV', false);
    mockApi(
      {
        'GET /api/site': () => json(site),
        'GET /api/books': () => json({ books: [] }),
      },
      NO_SESSION,
    );
    renderAt('/');
    const about = await screen.findByRole('region', { name: 'Qué es Universo Memorias' });
    expect(within(about).queryByRole('link', { name: /Se lee/ })).not.toBeInTheDocument();
    expect(within(about).getByText('Se lee')).toBeInTheDocument();
    vi.unstubAllEnvs();
    vi.stubEnv('DEV', false);
    mockApi(
      {
        'GET /api/site': () => json(site),
        'GET /api/books': () => json(books),
        'GET /api/books/libro-1': () => json({ ...detail, purchaseLinks: [] }),
      },
      NO_SESSION,
    );
    renderAt('/');
    const book = await screen.findAllByRole('region', { name: '[PLACEHOLDER] Libro 1' });
    expect(within(book.at(-1)!).getByRole('link', { name: 'Ver el libro' })).toBeInTheDocument();
    expect(within(book.at(-1)!).queryByRole('link', { name: 'Dónde conseguirlo' })).toBeNull();
    vi.unstubAllEnvs();
  });

  it('el mosaico limita la tarjeta grande a 2 filas y reparte el resto en filas completas', async () => {
    const experiences = Array.from({ length: 5 }, (_, i) => ({
      kind: i === 4 ? 'game' : 'quiz',
      order: i + 1,
    }));
    mockApi(
      {
        'GET /api/site': () => json(site),
        'GET /api/books': () => json(books),
        'GET /api/books/libro-1': () => json({ ...detail, experiences }),
      },
      NO_SESSION,
    );
    renderAt('/');
    const section = await screen.findByRole('region', { name: /experiencia inmersiva/ });
    const grid = section.querySelector<HTMLElement>('.exp-grid')!;
    expect(grid.style.getPropertyValue('--first-rows')).toBe('2');
    // 5 experiencias: la grande y 2 a su lado; las 2 restantes llenan una fila (12 / 2 columnas).
    expect(grid.style.getPropertyValue('--rest')).toBe('2');
    expect(section.querySelectorAll('.exp-card')).toHaveLength(5);
  });

  it('en producción no se pintan los marcadores [PLACEHOLDER] ni las secciones vacías', async () => {
    vi.stubEnv('DEV', false);
    mockApi(
      {
        'GET /api/site': () =>
          json({
            universe: { introHtml: '' },
            author: { bioHtml: '' },
            social: [],
            lockMessage: 'x',
          }),
        'GET /api/books': () => json({ books: [{ ...summary({}), cover: undefined }] }),
        'GET /api/books/libro-1': () => json({ ...detail, purchaseLinks: [] }),
      },
      NO_SESSION,
    );
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Universo Memorias' }),
    ).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Wiki del universo' });
    expect(screen.queryByText(/\[PLACEHOLDER\] ¿Qué es/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Conoce a la autora' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cómo comprar el libro' })).not.toBeInTheDocument();
    // Sin franja de compra no hay salida «Aún no lo tengo» que lleve a una sección inexistente.
    expect(screen.queryByRole('link', { name: /Aún no lo tengo/ })).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});

describe('landing: orden de las secciones', () => {
  it('las reseñas van antes de la secuencia de publicación', async () => {
    mockApi(
      {
        ...full,
        'GET /api/reviews?limit=6': () =>
          json({
            reviews: [
              {
                id: '670000000000000000000051',
                text: '[PLACEHOLDER] Reseña',
                authorName: 'Lectora',
                order: 1,
              },
            ],
          }),
      },
      NO_SESSION,
    );
    renderAt('/');
    const reviews = await screen.findByRole('region', { name: 'Reseñas de lectores' });
    const saga = await screen.findByRole('region', { name: 'Secuencia de publicación' });
    expect(reviews.compareDocumentPosition(saga) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
