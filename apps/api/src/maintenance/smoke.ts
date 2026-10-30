/**
 * Comprobación de humo del sitio publicado. SOLO LEE: ninguna petición escribe datos (el ingreso falso responde 401 sin
 * tocar ninguna cuenta; solo gasta un intento del contador de la red de quien lo corre). No lleva dependencias: usa el
 * `fetch` de Node.
 */

export type SmokeMode = 'noindex' | 'indexable';
export type CheckStatus = 'ok' | 'fail' | 'warn';

export interface SmokeCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: 'manual' | 'follow';
  },
) => Promise<Response>;

export interface SmokeOptions {
  /** Dirección pública del sitio (la del Static Site, que también reenvía `/api`). */
  baseUrl: string;
  /** `noindex`: el sitio debe estar cerrado a los buscadores (lo normal hasta el lanzamiento). `indexable`: abierto. */
  mode?: SmokeMode;
  /** `false` salta la comprobación de `www` (para direcciones que no son de producción). */
  checkWww?: boolean;
  fetchFn?: FetchLike;
}

const SECURITY_HEADERS: Array<{ header: string; test: (value: string) => boolean; need: string }> =
  [
    {
      header: 'strict-transport-security',
      test: (value) => /max-age=\d+/.test(value),
      need: 'Strict-Transport-Security con max-age',
    },
    {
      header: 'x-content-type-options',
      test: (v) => /nosniff/i.test(v),
      need: 'X-Content-Type-Options: nosniff',
    },
    { header: 'referrer-policy', test: (v) => v.trim() !== '', need: 'Referrer-Policy' },
  ];

function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

export async function runSmoke(options: SmokeOptions): Promise<SmokeCheck[]> {
  const origin = new URL(options.baseUrl).origin;
  const host = new URL(origin).hostname;
  const mode = options.mode ?? 'noindex';
  const doFetch: FetchLike = options.fetchFn ?? ((url, init) => fetch(url, init));
  const checks: SmokeCheck[] = [];
  const add = (name: string, status: CheckStatus, detail: string) =>
    checks.push({ name, status, detail });

  const get = (path: string, init: Parameters<FetchLike>[1] = {}) =>
    doFetch(`${origin}${path}`, init);
  async function step(name: string, run: () => Promise<[CheckStatus, string]>) {
    try {
      const [status, detail] = await run();
      add(name, status, detail);
    } catch (error) {
      add(
        name,
        'fail',
        `No se pudo hacer la petición (${error instanceof Error ? error.message : 'error'})`,
      );
    }
  }

  await step('API: /api/health responde y la base de datos está arriba', async () => {
    const res = await get('/api/health');
    const body = (await res.json().catch(() => null)) as { db?: string } | null;
    return res.status === 200 && body?.db === 'up'
      ? ['ok', 'HTTP 200, db: up']
      : ['fail', `HTTP ${res.status}, db: ${body?.db ?? 'sin dato'}`];
  });

  await step('API: /api/books responde con una lista (puede estar vacía)', async () => {
    const res = await get('/api/books');
    const body = (await res.json().catch(() => null)) as { books?: unknown } | null;
    return res.status === 200 && Array.isArray(body?.books)
      ? ['ok', `HTTP 200, ${(body?.books as unknown[]).length} libro(s)`]
      : ['fail', `HTTP ${res.status}`];
  });

  await step(
    'Ingreso con datos falsos da 401 (no 403, 429 ni 500) y muestra el contador de intentos',
    async () => {
      const res = await get('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({
          email: 'smoke-prod-no-existe@ejemplo.com',
          password: 'Clave-De-Prueba-123',
        }),
      });
      const limit =
        res.headers.get('ratelimit') ??
        res.headers.get('ratelimit-remaining') ??
        'sin cabecera RateLimit';
      return res.status === 401
        ? ['ok', `HTTP 401 · RateLimit: ${limit}`]
        : ['fail', `HTTP ${res.status} · RateLimit: ${limit}`];
    },
  );

  for (const [label, path] of [
    ['el sitio web (/)', '/'],
    ['el API (/api/health)', '/api/health'],
  ] as const) {
    await step(`Cabeceras de seguridad en ${label}`, async () => {
      const res = await get(path);
      const missing = SECURITY_HEADERS.filter(
        ({ header, test }) => !test(res.headers.get(header) ?? ''),
      ).map(({ need }) => need);
      const framing =
        (res.headers.get('x-frame-options') ?? '') !== '' ||
        /frame-ancestors/i.test(res.headers.get('content-security-policy') ?? '');
      if (!framing) missing.push('X-Frame-Options o frame-ancestors');
      return missing.length === 0
        ? ['ok', 'HSTS, nosniff, Referrer-Policy y anti-iframe']
        : ['fail', `Faltan: ${missing.join('; ')}`];
    });
  }

  await step('CSP en solo-reporte en el sitio web (todavía no bloquea)', async () => {
    const res = await get('/');
    return res.headers.get('content-security-policy-report-only')
      ? ['ok', 'Content-Security-Policy-Report-Only presente']
      : [
          'warn',
          'Aún no hay Content-Security-Policy-Report-Only (llega con la configuración del Static Site)',
        ];
  });

  await step(
    mode === 'noindex'
      ? 'Cerrado a buscadores: meta noindex en el HTML'
      : 'Abierto a buscadores: sin meta noindex en el HTML',
    async () => {
      const html = await (await get('/')).text();
      const hasNoindex = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
      return hasNoindex === (mode === 'noindex')
        ? ['ok', hasNoindex ? 'trae noindex' : 'no trae noindex']
        : [
            'fail',
            hasNoindex
              ? 'trae noindex y debería estar abierto'
              : 'NO trae noindex y debería estar cerrado',
          ];
    },
  );

  await step('El API siempre pide no indexarse (X-Robots-Tag: noindex)', async () => {
    const tag = (await get('/api/health')).headers.get('x-robots-tag') ?? '';
    return /noindex/i.test(tag)
      ? ['ok', `X-Robots-Tag: ${tag}`]
      : ['fail', 'Falta X-Robots-Tag: noindex en /api'];
  });

  await step(
    `robots.txt coincide con el modo «${mode === 'noindex' ? 'cerrado' : 'abierto'}»`,
    async () => {
      const res = await get('/robots.txt');
      const text = await res.text();
      if (res.status !== 200) return ['fail', `HTTP ${res.status}`];
      const blocksAll = /^Disallow:\s*\/\s*$/m.test(text);
      if (mode === 'noindex') {
        return blocksAll && !/^Allow:/m.test(text)
          ? ['ok', 'Disallow: / (todo cerrado)']
          : ['fail', 'No bloquea todo el sitio'];
      }
      const private_ = ['/admin', '/panel', '/u/', '/api/'].every((zone) =>
        text.includes(`Disallow: ${zone}`),
      );
      const sitemap = text.includes(`Sitemap: ${origin}/sitemap.xml`);
      return !blocksAll && private_ && sitemap
        ? ['ok', 'abierto, con las zonas privadas protegidas y el sitemap anunciado']
        : [
            'fail',
            `${blocksAll ? 'sigue bloqueando todo; ' : ''}${private_ ? '' : 'faltan zonas privadas; '}${sitemap ? '' : 'falta la línea Sitemap'}`,
          ];
    },
  );

  await step(
    `sitemap.xml ${mode === 'noindex' ? 'no se anuncia (404)' : 'responde con las páginas públicas'}`,
    async () => {
      const res = await get('/sitemap.xml');
      if (mode === 'noindex') {
        return res.status === 404
          ? ['ok', 'HTTP 404']
          : ['fail', `HTTP ${res.status} (debería ser 404 mientras esté cerrado)`];
      }
      const text = await res.text();
      const clean = !/\/panel|\/admin|\/u\/|\/ingresar|\/registro/.test(text);
      return res.status === 200 &&
        text.includes('<urlset') &&
        text.includes(`<loc>${origin}`) &&
        clean
        ? ['ok', `HTTP 200, ${text.split('<url>').length - 1} direcciones`]
        : ['fail', `HTTP ${res.status}${clean ? '' : ' · incluye páginas privadas'}`];
    },
  );

  if (
    options.checkWww !== false &&
    !host.startsWith('www.') &&
    host.includes('.') &&
    !/^\d+\./.test(host) &&
    host !== 'localhost'
  ) {
    await step(`https://www.${host} redirige al dominio principal`, async () => {
      const res = await doFetch(`https://www.${host}/`, { redirect: 'manual' });
      const location = res.headers.get('location') ?? '';
      return [301, 308].includes(res.status) && location.startsWith(origin)
        ? ['ok', `HTTP ${res.status} → ${location}`]
        : ['fail', `HTTP ${res.status}${location ? ` → ${location}` : ''}`];
    });
  } else {
    add('www redirige al dominio principal', 'warn', 'No aplica a esta dirección');
  }

  for (const path of ['/admin', '/panel', '/privacidad', '/terminos', '/cookies', '/ingresar']) {
    await step(`${path} entrega la aplicación`, async () => {
      const res = await get(path);
      const html = await res.text();
      return res.status === 200 && /id="root"/.test(html)
        ? ['ok', 'HTTP 200 con la aplicación']
        : ['fail', `HTTP ${res.status}`];
    });
  }

  await step('Una dirección que no existe da 404 de verdad (no 200)', async () => {
    const res = await get('/esto-no-existe-comprobacion-de-humo');
    const html = await res.text();
    return res.status === 404 && /Página no encontrada/.test(html)
      ? ['ok', 'HTTP 404 con la página «no encontrada»']
      : [
          'fail',
          `HTTP ${res.status} (el sitio estático debe responder 404 con 404.html, sin comodín)`,
        ];
  });

  await step('Las visitas anónimas no reciben ninguna cookie', async () => {
    const withCookies: string[] = [];
    for (const path of ['/', '/api/health', '/api/books', '/api/site']) {
      const cookies = setCookies(await get(path));
      if (cookies.length > 0)
        withCookies.push(`${path} (${cookies.map((c) => c.split('=')[0]).join(', ')})`);
    }
    return withCookies.length === 0
      ? ['ok', 'ninguna Set-Cookie']
      : ['fail', `Ponen cookies: ${withCookies.join('; ')}`];
  });

  return checks;
}

const MARK: Record<CheckStatus, string> = { ok: '✓', fail: '✗', warn: '!' };

export function formatSmoke(checks: SmokeCheck[]): string {
  const lines = checks.map((c) => `${MARK[c.status]} ${c.name}\n    ${c.detail}`);
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  lines.push(
    '',
    fails === 0
      ? `✓ Todo en orden (${checks.length} comprobaciones, ${warns} aviso(s)).`
      : `✗ ${fails} comprobación(es) fallaron de ${checks.length}.`,
  );
  return lines.join('\n');
}
