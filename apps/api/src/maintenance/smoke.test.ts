import { describe, expect, it } from 'vitest';
import { formatSmoke, runSmoke, type FetchLike, type SmokeMode } from './smoke.js';

const ORIGIN = 'https://universomemorias.com';
const SECURE = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};
const APP_HTML = (extra = '') =>
  `<!doctype html><html><head>${extra}</head><body><div id="root"></div></body></html>`;

type Handler = (request: { method: string; path: string; host: string }) => Response | undefined;

/** Un sitio de mentira que responde como debería el de verdad; cada prueba cambia lo que quiera romper. */
function fakeSite(mode: SmokeMode, override: Handler = () => undefined) {
  const requests: Array<{ method: string; url: string }> = [];
  const fetchFn: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    const method = init?.method ?? 'GET';
    requests.push({ method, url });
    const custom = override({ method, path: parsed.pathname, host: parsed.host });
    if (custom) return custom;
    if (parsed.host === 'www.universomemorias.com') {
      return new Response(null, { status: 301, headers: { location: `${ORIGIN}/` } });
    }
    const html = (body: string, status = 200) =>
      new Response(body, { status, headers: { ...SECURE, 'content-type': 'text/html' } });
    switch (parsed.pathname) {
      case '/api/health':
        return Response.json(
          { status: 'ok', db: 'up', uptimeSeconds: 5 },
          { headers: { ...SECURE, 'x-robots-tag': 'noindex' } },
        );
      case '/api/books':
        return Response.json({ books: [] }, { headers: { ...SECURE, 'x-robots-tag': 'noindex' } });
      case '/api/site':
        return Response.json({}, { headers: SECURE });
      case '/api/auth/login':
        return Response.json(
          { error: { code: 'AUTH_INVALID', message: 'x' } },
          { status: 401, headers: { ratelimit: 'limit=30, remaining=29, reset=900' } },
        );
      case '/robots.txt':
        return new Response(
          mode === 'noindex'
            ? 'User-agent: *\nDisallow: /\n'
            : `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /panel\nDisallow: /u/\nDisallow: /api/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
        );
      case '/sitemap.xml':
        return mode === 'noindex'
          ? new Response('no', { status: 404 })
          : new Response(
              `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/wiki</loc></url></urlset>`,
              {
                headers: { 'content-type': 'application/xml' },
              },
            );
      case '/esto-no-existe-comprobacion-de-humo':
        return html('<h1>Página no encontrada</h1>', 404);
      default:
        return html(
          APP_HTML(mode === 'noindex' ? '<meta name="robots" content="noindex, nofollow">' : ''),
        );
    }
  };
  return { fetchFn, requests };
}

const names = (checks: Awaited<ReturnType<typeof runSmoke>>, status: string) =>
  checks.filter((check) => check.status === status).map((check) => check.name);

describe('runSmoke (comprobación de humo)', () => {
  it('un sitio cerrado y bien configurado pasa todo (solo avisa de la CSP que aún no existe)', async () => {
    const { fetchFn } = fakeSite('noindex');
    const checks = await runSmoke({ baseUrl: ORIGIN, mode: 'noindex', fetchFn });
    expect(names(checks, 'fail')).toEqual([]);
    expect(names(checks, 'warn')).toEqual([expect.stringMatching(/CSP en solo-reporte/)]);
    expect(checks.length).toBeGreaterThanOrEqual(18);
    expect(formatSmoke(checks)).toMatch(/✓ Todo en orden/);
  });

  it('un sitio abierto pasa en modo «indexable» y falla en modo «noindex»', async () => {
    const open = fakeSite('indexable');
    expect(
      names(await runSmoke({ baseUrl: ORIGIN, mode: 'indexable', fetchFn: open.fetchFn }), 'fail'),
    ).toEqual([]);
    const wrong = await runSmoke({ baseUrl: ORIGIN, mode: 'noindex', fetchFn: open.fetchFn });
    expect(names(wrong, 'fail').join(' | ')).toMatch(/noindex|robots\.txt|sitemap/);
  });

  it('abierto, el bloqueo de los rastreadores de IA no cuenta como «bloquea todo»; un bloqueo de todos sí', async () => {
    const ai = 'User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n';
    const zones = 'Disallow: /admin\nDisallow: /panel\nDisallow: /u/\nDisallow: /api/\n';
    const sitemap = `\nSitemap: ${ORIGIN}/sitemap.xml\n`;
    const robots =
      (text: string) =>
      ({ path }: { path: string }) =>
        path === '/robots.txt' ? new Response(text) : undefined;
    const run = async (text: string) =>
      names(
        await runSmoke({
          baseUrl: ORIGIN,
          mode: 'indexable',
          fetchFn: fakeSite('indexable', robots(text)).fetchFn,
        }),
        'fail',
      );
    // Como el `robots.txt` real: todos abiertos y los de IA con su `Disallow: /`.
    expect(await run(`User-agent: *\nAllow: /\n${zones}\n${ai}${sitemap}`)).toEqual([]);
    // Con los de IA primero y los demás después, también.
    expect(await run(`${ai}\nUser-agent: *\nAllow: /\n${zones}${sitemap}`)).toEqual([]);
    // Un `Disallow: /` en el grupo de todos sí cierra el sitio, aunque también haya grupo de IA.
    expect(
      (await run(`User-agent: *\nDisallow: /\n${zones}\n${ai}${sitemap}`)).join(' | '),
    ).toMatch(/robots\.txt/);
  });

  it('un sitio cerrado falla si se espera abierto (el día del lanzamiento se nota)', async () => {
    const closed = fakeSite('noindex');
    const checks = await runSmoke({ baseUrl: ORIGIN, mode: 'indexable', fetchFn: closed.fetchFn });
    expect(names(checks, 'fail').length).toBeGreaterThanOrEqual(3);
    expect(formatSmoke(checks)).toMatch(/✗ \d+ comprobación/);
  });

  it('solo lee: la única petición que no es GET es el ingreso falso, con un correo que no existe', async () => {
    const { fetchFn, requests } = fakeSite('noindex');
    await runSmoke({ baseUrl: ORIGIN, mode: 'noindex', fetchFn });
    const writes = requests.filter((r) => r.method !== 'GET');
    expect(writes).toEqual([{ method: 'POST', url: `${ORIGIN}/api/auth/login` }]);
  });

  it('muestra el contador de intentos del ingreso (para comprobar la IP real desde dos redes)', async () => {
    const { fetchFn } = fakeSite('noindex');
    const checks = await runSmoke({ baseUrl: ORIGIN, fetchFn });
    expect(checks.find((c) => c.name.startsWith('Ingreso con datos falsos'))?.detail).toContain(
      'remaining=29',
    );
  });

  it.each([
    [
      'el ingreso falso responde 429',
      (p: string) => (p === '/api/auth/login' ? new Response('{}', { status: 429 }) : undefined),
      /Ingreso con datos falsos/,
    ],
    [
      'la base de datos está caída',
      (p: string) =>
        p === '/api/health'
          ? Response.json(
              { status: 'ok', db: 'down' },
              { headers: { ...SECURE, 'x-robots-tag': 'noindex' } },
            )
          : undefined,
      /health/,
    ],
    [
      'el API no pide noindex',
      (p: string) =>
        p === '/api/health' ? Response.json({ db: 'up' }, { headers: SECURE }) : undefined,
      /X-Robots-Tag/,
    ],
    [
      'una dirección inexistente da 200',
      (p: string) =>
        p === '/esto-no-existe-comprobacion-de-humo'
          ? new Response(APP_HTML(), { status: 200 })
          : undefined,
      /404 de verdad/,
    ],
    [
      'la portada pone una cookie',
      (p: string) =>
        p === '/'
          ? new Response(APP_HTML('<meta name="robots" content="noindex">'), {
              headers: { ...SECURE, 'set-cookie': 'visita=1; Path=/' },
            })
          : undefined,
      /cookie/,
    ],
    [
      '/admin no entrega la aplicación',
      (p: string) => (p === '/admin' ? new Response('nada', { status: 404 }) : undefined),
      /\/admin/,
    ],
  ])('detecta que %s', async (_label, respond, expected) => {
    const { fetchFn } = fakeSite('noindex', ({ path }) => respond(path));
    const failed = names(await runSmoke({ baseUrl: ORIGIN, mode: 'noindex', fetchFn }), 'fail');
    expect(failed.join(' | ')).toMatch(expected);
  });

  it('detecta cabeceras de seguridad que faltan, con el nombre de cada una', async () => {
    const { fetchFn } = fakeSite('noindex', ({ path }) =>
      path === '/' ? new Response(APP_HTML('<meta name="robots" content="noindex">')) : undefined,
    );
    const checks = await runSmoke({ baseUrl: ORIGIN, fetchFn });
    const web = checks.find((c) => c.name.includes('el sitio web'));
    expect(web?.status).toBe('fail');
    expect(web?.detail).toMatch(/Strict-Transport-Security/);
    expect(web?.detail).toMatch(/nosniff/);
    expect(web?.detail).toMatch(/frame-ancestors/);
  });

  it('un clic de www sin redirección falla; sin www o en localhost se omite con un aviso', async () => {
    const noRedirect = fakeSite('noindex', ({ host }) =>
      host.startsWith('www.') ? new Response('hola', { status: 200 }) : undefined,
    );
    const bad = await runSmoke({ baseUrl: ORIGIN, fetchFn: noRedirect.fetchFn });
    expect(names(bad, 'fail').join(' ')).toMatch(/www/);

    const local = fakeSite('noindex');
    const checks = await runSmoke({
      baseUrl: 'http://localhost:5173',
      fetchFn: local.fetchFn,
      checkWww: false,
    });
    expect(names(checks, 'warn').join(' ')).toMatch(/www/);
  });

  it('si el sitio no responde, falla cada comprobación con un mensaje claro y sin dato inventado', async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error('fetch failed');
    };
    const checks = await runSmoke({ baseUrl: ORIGIN, fetchFn });
    expect(checks.filter((c) => c.status === 'fail').length).toBeGreaterThanOrEqual(15);
    expect(checks.every((c) => c.status !== 'ok')).toBe(true);
    expect(checks[0]?.detail).toMatch(/No se pudo hacer la petición \(fetch failed\)/);
  });

  it('el sitemap abierto no puede traer páginas privadas', async () => {
    const { fetchFn } = fakeSite('indexable', ({ path }) =>
      path === '/sitemap.xml'
        ? new Response(`<urlset><url><loc>${ORIGIN}/panel</loc></url></urlset>`)
        : undefined,
    );
    const failed = names(await runSmoke({ baseUrl: ORIGIN, mode: 'indexable', fetchFn }), 'fail');
    expect(failed.join(' ')).toMatch(/sitemap/);
  });
});
