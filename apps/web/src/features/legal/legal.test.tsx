import { LEGAL_VERSION } from '@libro/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../test/mockApi';
import { COOKIE_NOTICE_KEY } from './CookieNotice';

beforeEach(() => {
  window.localStorage.clear();
  mockApi({}, { session: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const PAGES = [
  { path: '/privacidad', title: 'Política de privacidad' },
  { path: '/terminos', title: 'Términos de uso' },
  { path: '/cookies', title: 'Política de cookies' },
] as const;

describe('páginas legales', () => {
  it.each(PAGES)(
    '$path carga con un solo titular y el cartel de borrador',
    async ({ path, title }) => {
      renderAt(path);
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByText('Borrador pendiente de revisión legal')).toBeInTheDocument();
      expect(screen.getByText(new RegExp(LEGAL_VERSION))).toBeInTheDocument();
      expect(screen.getByText('3 de noviembre de 2026')).toBeInTheDocument();
      // Los datos que ya no se publican no aparecen.
      expect(document.body.textContent).not.toMatch(/identificación|domicilio/i);
    },
  );

  it.each(PAGES)('$path enlaza a las otras dos páginas legales', async ({ path, title }) => {
    renderAt(path);
    await screen.findByRole('heading', { level: 1, name: title });
    const index = screen.getByRole('navigation', { name: 'Textos legales' });
    expect(within(index).getAllByRole('link')).toHaveLength(3);
    expect(within(index).getByRole('link', { current: 'page' })).toHaveAttribute('href', path);
  });

  it('la privacidad dice la edad mínima, la autorización y que no hay verificación', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    expect(screen.getAllByText(/16 años o más/).length).toBeGreaterThan(0);
    expect(screen.getByText(/no verificamos tu edad/i)).toBeInTheDocument();
    expect(screen.getByText(/no los vendemos/i)).toBeInTheDocument();
  });

  it('la privacidad lista a los proveedores que tratan datos y cómo pedir el borrado', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    const terms = screen.getAllByRole('term').map((node) => node.textContent);
    for (const name of [
      'Cloudflare',
      'Render',
      'MongoDB Atlas',
      'Cloudinary',
      'Resend',
      'Google Identity',
    ]) {
      expect(terms).toContain(name);
    }
    expect(screen.getByRole('link', { name: /Panel › Cuenta/ })).toHaveAttribute(
      'href',
      '/panel/cuenta',
    );
  });

  it('solo quedan marcados los datos y propuestas que siguen abiertos', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    const article = screen.getByRole('article');
    const marks = (pattern: RegExp) =>
      within(article)
        .queryAllByText(pattern)
        .map((node) => node.textContent);
    // Sin nombre en el panel, lo único pendiente es ese nombre; ya no queda ninguna propuesta abierta.
    expect(marks(/^\[PLACEHOLDER: /)).toEqual(['[PLACEHOLDER: nombre legal de la titular]']);
    expect(marks(/^\[PROPUESTA: /)).toEqual([]);
    // La leyenda del cartel explica la etiqueta de dato pendiente (ya no hay propuestas).
    const note = screen.getByRole('note');
    expect(within(note).getByText('[PLACEHOLDER]')).toBeInTheDocument();
    expect(within(note).queryByText('[PROPUESTA]')).toBeNull();
  });

  it('la privacidad tiene la sección de datos de Google con lo que se recibe y lo que no se hace', async () => {
    renderAt('/privacidad');
    const heading = await screen.findByRole('heading', { name: /Datos que vienen de Google/ });
    const section = heading.closest('section') as HTMLElement;
    expect(
      within(section).getByText(/correo, tu nombre y si ese correo está verificado/),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/No vendemos esa información, no la usamos para publicidad/),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/El uso de la información que recibimos de Google se limita/),
    ).toBeInTheDocument();
    // No se afirma lo que el código no hace: el identificador de Google no se guarda.
    expect(section.textContent).toMatch(/No guardamos .* el identificador de tu cuenta de Google/);
  });

  it.each(PAGES)(
    '$path: el índice enlaza a cada apartado, que existe y tiene su titular',
    async ({ path, title }) => {
      renderAt(path);
      await screen.findByRole('heading', { level: 1, name: title });
      const toc = screen.getByRole('navigation', { name: 'En esta página' });
      const links = within(toc).getAllByRole('link');
      expect(links.length).toBeGreaterThanOrEqual(5);
      for (const anchor of links) {
        const id = anchor.getAttribute('href')?.slice(1) ?? '';
        const section = document.getElementById(id);
        expect(section, id).not.toBeNull();
        expect(section?.querySelector('h2')).not.toBeNull();
      }
    },
  );

  it.each(PAGES)('$path: sin rayas largas ni cajas de más en el texto', async ({ path, title }) => {
    renderAt(path);
    await screen.findByRole('heading', { level: 1, name: title });
    const article = screen.getByRole('article');
    expect(article.textContent).not.toMatch(/[—–]/);
    // Una sola franja de aviso: no hay otras alertas dentro del texto.
    expect(within(article).queryAllByRole('alert')).toHaveLength(0);
    expect(within(article).queryAllByRole('status')).toHaveLength(0);
  });

  it('las cookies declaran la sesión como única cookie y el script de Google bajo demanda', async () => {
    renderAt('/cookies');
    await screen.findByRole('heading', { level: 1, name: 'Política de cookies' });
    const names = screen.getAllByRole('term').map((node) => node.textContent);
    // Solo las cookies de sesión y su pista; el resto son claves del almacenamiento del navegador.
    expect(names.slice(0, 3)).toEqual(['libro_at', 'libro_rt', 'libro_s']);
    expect(names).toContain('libro_cookie_notice');
    const main = screen.getByRole('main');
    expect(within(main).getByText(/No usamos analítica ni publicidad/)).toBeInTheDocument();
    expect(within(main).getByText(/no se carga hasta que tocas ese botón/)).toBeInTheDocument();
  });

  it('el pie del sitio enlaza a las tres', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(within(legal).getByRole('link', { name: 'Privacidad' })).toHaveAttribute(
      'href',
      '/privacidad',
    );
    expect(within(legal).getByRole('link', { name: 'Términos' })).toHaveAttribute(
      'href',
      '/terminos',
    );
    expect(within(legal).getByRole('link', { name: 'Cookies' })).toHaveAttribute(
      'href',
      '/cookies',
    );
  });
});

describe('aviso de cookies', () => {
  it('se muestra la primera vez, enlaza a la política y se recuerda al cerrarlo', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt('/estado');
    const notice = await screen.findByRole('region', { name: 'Aviso de cookies' });
    expect(within(notice).getByText(/solo cookies necesarias/)).toBeInTheDocument();
    expect(within(notice).getByRole('link', { name: 'Política de cookies' })).toHaveAttribute(
      'href',
      '/cookies',
    );
    await user.click(within(notice).getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).toBeNull();
    expect(window.localStorage.getItem(COOKIE_NOTICE_KEY)).toBe('1');
    unmount();

    // Otra visita: ya no vuelve a salir.
    renderAt('/estado');
    await screen.findByRole('heading', { level: 1, name: 'Estado del sistema' });
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).toBeNull();
  });

  it('sin almacenamiento disponible sigue funcionando y se oculta mientras la página siga abierta', async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    try {
      renderAt('/estado');
      const notice = await screen.findByRole('region', { name: 'Aviso de cookies' });
      await user.click(within(notice).getByRole('button', { name: 'Entendido' }));
      expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).toBeNull();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});

const SITE = { universe: { introHtml: '' }, author: { bioHtml: '' }, social: [], lockMessage: 'x' };
/** Un nombre evidentemente inventado: el real lo escribe la administradora en el panel y nunca va al código. */
const FAKE_OWNER = 'Titular Inventada de Prueba';
const withOwner = (legalOwnerName?: string) =>
  mockApi(
    { 'GET /api/site': () => json({ ...SITE, ...(legalOwnerName ? { legalOwnerName } : {}) }) },
    { session: null },
  );

describe('titular de los textos legales', () => {
  it.each(['/privacidad', '/terminos'])(
    '%s muestra el nombre que se escribió en el panel (ajustes del sitio)',
    async (path) => {
      withOwner(FAKE_OWNER);
      renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      await screen.findAllByText(FAKE_OWNER);
      expect(screen.queryByText('[PLACEHOLDER: nombre legal de la titular]')).toBeNull();
      // Cada aparición del nombre sale del mismo componente (de los ajustes), ninguna está escrita a mano.
      const slots = document.querySelectorAll('[data-legal-owner]');
      expect(slots.length).toBeGreaterThan(0);
      const occurrences = (document.body.textContent ?? '').split(FAKE_OWNER).length - 1;
      expect(occurrences).toBe(slots.length);
    },
  );

  it.each(['/privacidad', '/terminos'])(
    '%s sin nombre en el panel muestra el dato pendiente en su lugar',
    async (path) => {
      withOwner(undefined);
      renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      expect(
        await screen.findByText('[PLACEHOLDER: nombre legal de la titular]'),
      ).toBeInTheDocument();
      expect(document.querySelectorAll('[data-legal-owner]')).toHaveLength(0);
    },
  );

  /**
   * Guardia contra un nombre de persona escrito en el código: sin nombre en el panel, los únicos nombres propios de
   * varias palabras que pueden aparecer en las tres páginas son estos. Si aparece otro (por ejemplo el nombre real de la
   * titular escrito a mano), la prueba falla: el nombre debe venir siempre de los ajustes del sitio.
   */
  const ALLOWED_PROPER_NAMES = new Set([
    'Agencia de Protección de Datos',
    'Costa Rica',
    'Datos Personales',
    'Estados Unidos',
    'Google Identity',
    'Jost y Newsreader',
    'MongoDB Atlas',
    'Open Font License',
    'Registros de Render y Cloudflare',
    'Render y Cloudflare',
    'República de Costa Rica',
    'Universo Memorias',
  ]);

  it.each(['/privacidad', '/terminos', '/cookies'])(
    '%s no trae ningún nombre propio fuera de la lista (el de la titular sale del panel)',
    async (path) => {
      withOwner(undefined);
      renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      const found = new Set<string>();
      const walker = document.createTreeWalker(screen.getByRole('main'), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of (node.textContent ?? '').matchAll(
          /\p{Lu}\p{Ll}+(?:(?:\s+(?:de|del|la|los|y))?\s+\p{Lu}\p{Ll}+)+/gu,
        )) {
          found.add(match[0]);
        }
      }
      expect([...found].filter((name) => !ALLOWED_PROPER_NAMES.has(name))).toEqual([]);
    },
  );
});

describe('contenido acordado de los textos', () => {
  const PROVIDERS = [
    ['Render', 'Estados Unidos', 'https://render.com/privacy'],
    ['Cloudflare', 'Estados Unidos', 'https://www.cloudflare.com/privacypolicy/'],
    [
      'MongoDB Atlas',
      'Estados Unidos (AWS, N. Virginia)',
      'https://www.mongodb.com/legal/privacy/privacy-policy',
    ],
    ['Cloudinary', 'Estados Unidos', 'https://cloudinary.com/privacy'],
    ['Resend', 'Estados Unidos', 'https://resend.com/legal/privacy-policy'],
    ['Google Identity', 'Estados Unidos', 'https://policies.google.com/privacy'],
    ['Namecheap', 'Estados Unidos', 'https://www.namecheap.com/legal/general/privacy-policy/'],
  ] as const;

  it.each(PROVIDERS)(
    'privacidad: %s con su país y el enlace a su política',
    async (name, country, href) => {
      renderAt('/privacidad');
      await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
      const term = screen.getAllByRole('term').find((node) => node.textContent === name);
      const detail = term?.nextElementSibling as HTMLElement;
      expect(detail.textContent).toContain(country);
      expect(
        within(detail).getByRole('link', { name: /^Política de privacidad de / }),
      ).toHaveAttribute('href', href);
    },
  );

  it('privacidad: Costa Rica, PRODHAB, plazos y registros acordados, sin datos que no se publican', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    const text = screen.getByRole('article').textContent ?? '';
    expect(text).toContain('persona física de Costa Rica');
    expect(text).toContain(
      'Agencia de Protección de Datos de los Habitantes (PRODHAB) de Costa Rica',
    );
    expect(text).toContain(
      'Ley N.º 8968 de Protección de la Persona frente al Tratamiento de sus Datos Personales y su reglamento',
    );
    expect(text).toContain(
      'en un plazo de 5 días hábiles contados desde el día siguiente a recibirla',
    );
    expect(text).toContain('en un plazo de 5 días hábiles desde que lo detectemos');
    expect(text).toContain(
      'Render guarda los registros técnicos del servicio 7 días en nuestro plan actual',
    );
    expect(text).toContain('no tenemos acceso a esos registros');
    expect(text).toContain('365 días');
    expect(text).toContain('hasta 90 días');
    expect(screen.getByRole('link', { name: 'política de privacidad de Google' })).toHaveAttribute(
      'href',
      'https://policies.google.com/privacy',
    );
    expect(text).not.toMatch(/Decreto/i);
  });

  it.each(['/privacidad', '/terminos', '/cookies'])(
    '%s no tiene ninguna [PROPUESTA] abierta',
    async (path) => {
      renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      expect(screen.getByRole('article').textContent).not.toContain('[PROPUESTA');
    },
  );

  it('privacidad: sin la fila del almacenamiento de documentos privados (hoy no se usa)', async () => {
    renderAt('/privacidad');
    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    const terms = screen.getAllByRole('term').map((node) => node.textContent);
    expect(terms).not.toContain('Almacenamiento de documentos privados');
    expect(terms).toHaveLength(7);
  });

  it('términos: ley y tribunales de Costa Rica, limitación de responsabilidad y créditos', async () => {
    renderAt('/terminos');
    await screen.findByRole('heading', { level: 1, name: 'Términos de uso' });
    const text = screen.getByRole('article').textContent ?? '';
    expect(text).toContain('Estos términos se rigen por las leyes de la República de Costa Rica');
    expect(text).toContain(
      'sin perjuicio de los derechos que como persona consumidora te reconozca la ley de tu país de residencia',
    );
    expect(text).toContain('El sitio se ofrece tal como está.');
    expect(text).toContain('en particular la Ley N.º 7472 de Costa Rica');
    expect(text).toContain(
      'Las tipografías Cinzel, Jost y Newsreader se usan bajo la licencia SIL Open Font License.',
    );
    expect(text).not.toContain('[PLACEHOLDER: cláusula');
    expect(text).not.toContain('[PLACEHOLDER: créditos');
  });
});
