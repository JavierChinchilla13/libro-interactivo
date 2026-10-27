import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

const demo = (publicId: string) => ({
  provider: 'cloudinary',
  publicId,
  url: `https://res.cloudinary.com/demo/image/upload/${publicId}`,
  width: 800,
  height: 1000,
  alt: `Imagen ${publicId}`,
});

// Las dos pruebas de este archivo cambian el ajuste global de la base: una a la vez.
test.describe.configure({ mode: 'serial' });

test.describe('rejilla inclinada del encabezado', () => {
  test('con 5 imágenes aparece bajo el titular y al quitarlas quedan marcadores de color', async ({
    page,
    browser,
    playwright,
    baseURL,
    isMobile,
  }) => {
    // El ajuste es global de la base: un solo proyecto lo modifica a la vez (el otro correría en paralelo).
    test.skip(isMobile, 'Ajuste global de la base: corre solo en escritorio.');
    const admin = await playwright.request.newContext({ baseURL });
    await admin.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    const current = (await (await admin.get('/api/admin/site-settings')).json()) as {
      universe: { introHtml: string; headline?: string };
    };
    // Con una frase corta (como la real) el titular cabe en una línea; al final se restaura la que había.
    const save = (headerImages: unknown[], headline = current.universe.headline) =>
      admin.patch('/api/admin/site-settings', {
        data: { universe: { ...current.universe, headerImages, headline } },
      });
    try {
      const ids = ['sample', 'cld-sample', 'cld-sample-2', 'cld-sample-3', 'cld-sample-4'];
      expect((await save(ids.map(demo), 'Universo Memorias')).status()).toBe(200);
      await page.goto('/');
      const grid = page.getByRole('region', { name: 'Imágenes del universo' });
      await expect(grid).toBeVisible();
      await expect(grid.getByRole('img')).toHaveCount(5);
      // El titular sigue siendo lo primero de la página y, con la rejilla, llena la primera pantalla (sin scroll).
      const heading = page.getByRole('heading', { level: 1 });
      const [h, g] = await Promise.all([heading.boundingBox(), grid.boundingBox()]);
      const viewport = page.viewportSize();
      expect(h && g && h.y < g.y).toBe(true);
      expect(h && g && viewport && h.y + h.height < g.y && g.y < viewport.height - 100).toBe(true);
      // La captura es solo de apoyo para revisar a ojo: se toma cuando la página terminó de cargar.
      await page.waitForLoadState('load');
      await page.screenshot({ path: process.env['GRID_SHOT'] ?? 'test-results/grid.png' });
    } finally {
      expect((await save([])).status()).toBe(200);
    }
    // `GET /api/site` se guarda 60 s en la caché del navegador: se mira desde un contexto nuevo (sin esa caché).
    const freshContext = await browser.newContext();
    try {
      const fresh = await freshContext.newPage();
      await fresh.goto(`${baseURL}/`);
      // Sin imágenes propias: en desarrollo quedan los marcadores de color (la rejilla sin ninguna imagen). En el
      // sitio publicado no se pinta nada; esta suite corre contra el servidor de desarrollo.
      const empty = fresh.getByRole('region', { name: 'Imágenes del universo' });
      await expect(empty).toBeVisible();
      await expect(empty.getByRole('img')).toHaveCount(0);
    } finally {
      await freshContext.close();
      await admin.dispose();
    }
  });
});

const sized = (publicId: string, width: number, height: number) => ({
  ...demo(publicId),
  width,
  height,
});

// Mezcla de horizontales y verticales, como las imágenes reales de la autora.
const IMAGES = [
  sized('sample', 589, 393),
  sized('cld-sample', 603, 754),
  sized('cld-sample-2', 683, 383),
  sized('cld-sample-3', 571, 859),
  sized('cld-sample-4', 618, 337),
];

interface Sample {
  f: number;
  left: number;
  right: number;
  /** Posición de la primera imagen original y de la primera de la segunda copia (una vuelta más allá). */
  first: number;
  second: number;
  /** Hay una imagen realmente a la vista (no recortada) cerca de cada borde de la ventana. */
  visibleLeft: boolean;
  visibleRight: boolean;
}

/** Detiene la marquesina y mide la hilera en varios puntos del ciclo (0 = inicio, ~1 = justo antes de repetirse). */
async function sampleCycle(page: Page) {
  return page.evaluate(async () => {
    const animation = document
      .getAnimations()
      .find((item) => (item as CSSAnimation).animationName === 'tilted-flow');
    if (!animation) return null;
    animation.pause();
    const duration = animation.effect?.getComputedTiming().duration as number;
    const samples: Sample[] = [];
    for (const f of [0, 0.125, 0.25, 0.5, 0.75, 0.875, 0.999, 0.9999]) {
      animation.currentTime = f * duration;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // `elementFromPoint` respeta los recortes: una imagen fuera de la caja visible no cuenta.
      const grid = document.querySelector('.tilted-grid')!.getBoundingClientRect();
      const hit = (x: number) => {
        for (let y = grid.top - 80; y < grid.bottom + 80; y += 8) {
          if (document.elementFromPoint(x, y)?.closest('.tilted-tile')) return true;
        }
        return false;
      };
      const rects = [...document.querySelectorAll('.tilted-track > li')].map((li) =>
        li.getBoundingClientRect(),
      );
      samples.push({
        f,
        left: Math.min(...rects.map((rect) => rect.left)),
        right: Math.max(...rects.map((rect) => rect.right)),
        first: rects[0]!.left,
        second: rects[5]!.left,
        visibleLeft: hit(40),
        visibleRight: hit(window.innerWidth - 40),
      });
    }
    return { duration, width: window.innerWidth, samples };
  });
}

test.describe('rejilla del encabezado: bucle continuo', () => {
  test('sin huecos ni saltos a 1280, 1920 y 2560 px; copias ocultas; pausas; movimiento reducido; celular', async ({
    browser,
    playwright,
    baseURL,
    isMobile,
  }) => {
    // El ajuste es global de la base: un solo proyecto lo modifica a la vez (el celular se prueba con un contexto aparte).
    test.skip(isMobile, 'Ajuste global de la base: corre solo en escritorio.');
    const admin = await playwright.request.newContext({ baseURL });
    await admin.post('/api/auth/login', {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    const current = (await (await admin.get('/api/admin/site-settings')).json()) as {
      universe: { introHtml: string; headline?: string };
    };
    const save = (headerImages: unknown[], headline = current.universe.headline) =>
      admin.patch('/api/admin/site-settings', {
        data: { universe: { ...current.universe, headerImages, headline } },
      });
    expect((await save(IMAGES, 'Universo Memorias')).status()).toBe(200);
    try {
      for (const [width, height] of [
        [1280, 800],
        [1920, 1080],
        [2560, 1440],
      ] as const) {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        await page.goto('/');
        const track = page.locator('.tilted-track');
        await expect(track).toBeVisible();
        // Se espera a que se midan las copias necesarias: (copias - 1) × vuelta cubre todo el ancho.
        await expect
          .poll(
            () =>
              track.evaluate((element) => {
                const copies = Number(element.getAttribute('data-copies'));
                const period = (element as HTMLElement).offsetWidth / copies;
                return (copies - 1) * period >= window.innerWidth;
              }),
            { message: `cobertura a ${width} px` },
          )
          .toBe(true);

        const result = await sampleCycle(page);
        expect(result, `marquesina a ${width} px`).not.toBeNull();
        const { duration, samples } = result!;
        // Una vuelta tarda entre 40 y 50 s.
        expect(duration).toBeGreaterThanOrEqual(40_000);
        expect(duration).toBeLessThanOrEqual(50_000);
        for (const sample of samples) {
          // Sin hueco a la derecha (la última imagen llega al borde) ni a la izquierda (solo el relleno de 16 px).
          expect(sample.right, `derecha a ${width} px, f=${sample.f}`).toBeGreaterThanOrEqual(
            width,
          );
          expect(sample.left, `izquierda a ${width} px, f=${sample.f}`).toBeLessThanOrEqual(40);
          // Y sin recortes: la inclinación no esconde las puntas arriba ni abajo (se veía a 2560 px).
          expect(
            sample.visibleRight,
            `imagen visible a la derecha, ${width} px, f=${sample.f}`,
          ).toBe(true);
          expect(
            sample.visibleLeft,
            `imagen visible a la izquierda, ${width} px, f=${sample.f}`,
          ).toBe(true);
        }
        // Sin salto al cerrar la vuelta: al final del ciclo la segunda copia está donde estaba la primera al inicio.
        const first = samples[0]!;
        const last = samples[samples.length - 1]!;
        expect(Math.abs(last.second - first.first), `salto a ${width} px`).toBeLessThan(4);

        // Solo las imágenes originales cuentan para lectores de pantalla; las copias van ocultas y sin texto.
        const tiles = await page.locator('.tilted-track > li').evaluateAll((items) =>
          items.map((item) => ({
            hidden: item.getAttribute('aria-hidden') === 'true',
            alt: item.querySelector('img')?.getAttribute('alt') ?? null,
          })),
        );
        expect(tiles.slice(0, 5).every((tile) => !tile.hidden && tile.alt)).toBe(true);
        expect(tiles.slice(5).every((tile) => tile.hidden && tile.alt === '')).toBe(true);
        expect(tiles.length % 5).toBe(0);
        await context.close();
      }

      // Pausas en escritorio: cursor encima, foco de teclado en la hilera y botón (oculto hasta recibir el foco).
      const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await desktop.newPage();
      await page.goto('/');
      const track = page.locator('.tilted-track');
      const state = () => track.evaluate((element) => getComputedStyle(element).animationPlayState);
      const pause = page.getByRole('button', { name: 'Pausar animación' });
      await expect.poll(state).toBe('running');
      // El botón no se ve: mide 1 px hasta que recibe el foco con Tab.
      expect((await pause.boundingBox())!.width).toBeLessThanOrEqual(2);
      await pause.focus();
      await expect.poll(state).toBe('paused');
      expect((await pause.boundingBox())!.width).toBeGreaterThan(40);
      await pause.press('Enter');
      await expect(page.getByRole('button', { name: 'Reanudar animación' })).toBeVisible();
      await page.locator('h1').click();
      // Pausada a propósito: sigue detenida aunque el foco se haya ido.
      await expect.poll(state).toBe('paused');
      await page.getByRole('button', { name: 'Reanudar animación' }).focus();
      await page.keyboard.press('Enter');
      await page.locator('h1').click();
      await expect.poll(state).toBe('running');
      // Foco en la hilera: se detiene; al salir, sigue.
      await page.locator('.tilted-stage').focus();
      await expect.poll(state).toBe('paused');
      await page.locator('h1').click();
      await expect.poll(state).toBe('running');
      // Cursor encima.
      await page.mouse.move(640, 500);
      await page.locator('.tilted-grid').hover();
      await expect.poll(state).toBe('paused');
      await page.mouse.move(640, 20);
      await expect.poll(state).toBe('running');
      await desktop.close();

      // Con «reducir movimiento»: sin animación y solo las imágenes originales a la vista.
      const reduced = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        reducedMotion: 'reduce',
      });
      const still = await reduced.newPage();
      await still.goto('/');
      await expect(still.locator('.tilted-track')).toBeVisible();
      expect(await sampleCycle(still)).toBeNull();
      const shown = await still
        .locator('.tilted-track > li')
        .evaluateAll(
          (items) => items.filter((item) => getComputedStyle(item).display !== 'none').length,
        );
      expect(shown).toBe(5);
      // Sin copias en el DOM (no solo ocultas): una sola vuelta de la hilera.
      await expect(still.locator('.tilted-track')).toHaveAttribute('data-copies', '1');
      expect(await still.locator('.tilted-track > li').count()).toBe(5);
      await reduced.close();

      // Celular: avanza sola, se puede deslizar con el dedo, se detiene con el botón y al tocar.
      const phone = await browser.newContext({ ...playwright.devices['Pixel 7'] });
      const mobile = await phone.newPage();
      await mobile.goto('/');
      const stage = mobile.locator('.tilted-stage');
      await expect(stage).toBeVisible();
      expect(await stage.evaluate((element) => getComputedStyle(element).overflowX)).toBe('auto');
      const left = () => stage.evaluate((element) => element.scrollLeft);
      await expect.poll(left, { timeout: 15_000 }).toBeGreaterThan(8);
      const settle = (ms: number) =>
        mobile.evaluate((time) => new Promise((resolve) => setTimeout(resolve, time)), ms);
      // El botón de pausa se alcanza con el teclado (en el celular, de una pantalla con teclado externo).
      await mobile.getByRole('button', { name: 'Pausar animación' }).focus();
      await mobile.keyboard.press('Enter');
      await settle(300);
      const stopped = await left();
      await settle(900);
      expect(Math.abs((await left()) - stopped)).toBeLessThanOrEqual(1);
      await mobile.getByRole('button', { name: 'Reanudar animación' }).focus();
      await mobile.keyboard.press('Enter');
      await mobile.locator('h1').click();
      await expect.poll(left, { timeout: 15_000 }).toBeGreaterThan(stopped + 4);
      // Al tocar se detiene (mientras el dedo está apoyado no avanza).
      await stage.dispatchEvent('touchstart');
      await settle(300);
      const touched = await left();
      await settle(900);
      expect(Math.abs((await left()) - touched)).toBeLessThanOrEqual(1);
      await phone.close();
    } finally {
      expect((await save([])).status()).toBe(200);
      await admin.dispose();
    }
  });
});

// Vive aquí (y no en `landing.spec.ts`) porque guarda todo el formulario de «Portada y autora», incluidas las imágenes
// del encabezado: en otro archivo correría a la vez que las pruebas de la rejilla y se pisarían entre sí.
test.describe('portada: edición en el panel', () => {
  test('la autora edita la portada en el panel y el visitante la ve', async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, 'Flujo de administración de escritorio.');
    const headline = `Frase E2E ${Date.now()}`;
    await page.goto('/ingresar');
    await page.getByLabel('Correo').fill(E2E_ADMIN.email);
    await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: /^Buen(os|as) (días|tardes|noches)/ })).toBeVisible();
    // Se guarda el ajuste actual para devolverlo al terminar (la base es compartida con otras pruebas).
    const before = (await (await page.request.get('/api/admin/site-settings')).json()) as {
      universe: unknown;
      social: unknown;
    };
    try {
      await page.getByRole('link', { name: 'Portada y autora' }).click();
      await page.getByLabel('Frase principal del sitio').fill(headline);
      // La base conserva lo guardado en corridas anteriores: se parte sin redes.
      const remove = page.getByRole('button', { name: /^Quitar/ });
      while ((await remove.count()) > 0) await remove.first().click();
      await page.getByRole('button', { name: '+ Agregar red' }).click();
      await page.getByLabel('Red 1').fill('Instagram E2E');
      await page.getByLabel('Enlace 1').fill('https://instagram.com/e2e');
      await page.getByRole('button', { name: 'Guardar' }).click();
      // El aviso no desaparece solo (el formulario no se recarga).
      await expect(page.getByText('Cambios guardados')).toBeVisible();
      await page.waitForTimeout(500);
      await expect(page.getByText('Cambios guardados')).toBeVisible();

      const visitor = await browser.newContext();
      const view = await visitor.newPage();
      await view.goto(`${baseURL}/`);
      await expect(view.getByRole('heading', { level: 1, name: headline })).toBeVisible();
      await expect(
        view
          .getByRole('list', { name: 'Redes sociales' })
          .getByRole('link', { name: 'Instagram E2E' }),
      ).toHaveAttribute('href', 'https://instagram.com/e2e');
      await visitor.close();
    } finally {
      await page.request.patch('/api/admin/site-settings', {
        data: { universe: before.universe, social: before.social },
      });
    }
  });
});
