import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

async function login(page: Page) {
  await page.goto('/admin');
  // Sin sesión, el panel manda al ingreso.
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
  await page.getByLabel('Correo').fill(E2E_ADMIN.email);
  await page.getByLabel('Contraseña').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio del panel' })).toBeVisible();
}

test.describe('panel de administración', () => {
  test('las rutas del panel exigen ingresar y las credenciales incorrectas se rechazan', async ({
    page,
  }) => {
    await page.goto('/admin/quizzes');
    await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
    await page.getByLabel('Correo').fill(E2E_ADMIN.email);
    await page.getByLabel('Contraseña').fill('contraseña-equivocada');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('el panel no desborda horizontalmente y el menú se abre en el celular', async ({
    page,
    isMobile,
  }) => {
    await login(page);
    for (const path of ['/admin', '/admin/libros', '/admin/quizzes', '/admin/wiki']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `desborde en ${path}`).toBeLessThanOrEqual(1);
    }
    if (isMobile) {
      await page.goto('/admin');
      const menu = page.getByRole('button', { name: 'Menú' });
      await menu.click();
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('link', { name: 'Quizzes' })).toBeVisible();
    }
  });

  test('crear un libro, crear un quiz, armarlo, validarlo, publicarlo y probarlo', async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      'Armar etapas y preguntas es una tarea de escritorio (el celular es para consultar y corregir).',
    );
    const stamp = Date.now();
    const bookTitle = `Libro E2E ${stamp}`;

    await login(page);

    // --- Libro ---
    await page.getByRole('link', { name: 'Libros', exact: true }).click();
    await page.getByRole('link', { name: '+ Nuevo libro' }).click();
    await page.getByRole('textbox', { name: /^Título/ }).fill(bookTitle);
    await expect(page.getByRole('textbox', { name: /^Dirección web/ })).toHaveValue(
      `libro-e2e-${stamp}`,
    );
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Cambios guardados')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/libros\/[0-9a-f]{24}$/);

    // Un libro publicado necesita portada: lo dice el formulario (sin llegar al servidor).
    await page.getByLabel('Estado').selectOption('published');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(
      page.getByText('Un libro publicado o «próximamente» necesita portada').first(),
    ).toBeVisible();
    await page.getByLabel('Estado').selectOption('draft');

    // --- Quiz ---
    await page.getByRole('link', { name: 'Quizzes', exact: true }).click();
    await page.getByRole('link', { name: '+ Nuevo quiz' }).click();
    await page.getByLabel('Libro').selectOption({ label: bookTitle });
    await page.getByRole('textbox', { name: /^Título/ }).fill('Quiz E2E');
    await page.getByRole('button', { name: 'Crear quiz' }).click();
    await expect(page).toHaveURL(/\/admin\/quizzes\/[0-9a-f]{24}$/);
    await expect(page.getByRole('heading', { name: 'Quiz E2E' })).toBeVisible();

    // Un quiz vacío no se puede publicar: validar lo explica.
    await page.getByRole('button', { name: 'Validar' }).click();
    await expect(page.getByLabel('Resultado de la validación')).toContainText('impiden publicar');

    // Etapa 1 y dos resultados.
    await page.getByRole('tab', { name: 'Etapas y preguntas' }).click();
    await page.getByRole('button', { name: '+ Agregar etapa' }).click();
    await page.getByRole('tab', { name: 'Resultados' }).click();
    await page.getByRole('button', { name: '+ Resultado en esta etapa' }).click();
    await page.getByRole('button', { name: '+ Resultado en esta etapa' }).click();
    await page.getByRole('textbox', { name: 'Título' }).nth(0).fill('Resultado A');
    await page.getByRole('textbox', { name: 'Título' }).nth(1).fill('Resultado B');

    // Una pregunta: nace con una respuesta por resultado (la i apunta al resultado i).
    await page.getByRole('tab', { name: 'Etapas y preguntas' }).click();
    await page.getByRole('button', { name: '+ Pregunta' }).click();
    await page.getByRole('textbox', { name: 'Texto de la pregunta' }).fill('¿Qué eliges?');
    await page.getByRole('textbox', { name: 'Respuesta 1' }).fill('Lo primero');
    await page.getByRole('textbox', { name: 'Respuesta 2' }).fill('Lo segundo');
    await expect(page.getByLabel('Suma al resultado').nth(0)).toHaveValue('r1');
    await expect(page.getByLabel('Suma al resultado').nth(1)).toHaveValue('r2');

    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('Borrador guardado.')).toBeVisible();

    // Validar y publicar.
    await page.getByRole('button', { name: 'Validar' }).click();
    await expect(page.getByText('El quiz está completo y se puede publicar')).toBeVisible();
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Publicada como versión 1.')).toBeVisible();

    // Vista previa en modo prueba: se juega la versión publicada.
    await page.getByRole('button', { name: 'Vista previa' }).click();
    await expect(page.getByText(/Modo prueba/)).toBeVisible();
    await page.getByRole('radio', { name: 'Lo primero' }).check();
    await page.getByRole('button', { name: 'Enviar respuestas' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado A' })).toBeVisible();

    // La pestaña de versiones muestra la v1.
    await page.getByRole('tab', { name: 'Versiones' }).click();
    await expect(page.getByRole('cell', { name: 'v1' })).toBeVisible();

    // El quiz figura como publicado en el listado.
    await page.getByRole('link', { name: '← Quizzes' }).click();
    await page.getByLabel('Libro').selectOption({ label: bookTitle });
    await expect(page.getByRole('row', { name: /Quiz E2E.*Publicado.*v1/ })).toBeVisible();
  });

  test('crear una entrada de la wiki y verla en la lista', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Formulario de escritorio.');
    const name = `Personaje E2E ${Date.now()}`;
    await login(page);
    await page.getByRole('link', { name: 'Wiki', exact: true }).click();
    await page.getByRole('link', { name: '+ Nueva entrada' }).click();
    await page.getByRole('textbox', { name: /^Nombre/ }).fill(name);
    await page.getByLabel('Estado').selectOption('published');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Cambios guardados')).toBeVisible();

    await page.getByRole('link', { name: '← Wiki' }).click();
    await page.getByRole('textbox', { name: 'Buscar por nombre' }).fill(name.toLowerCase());
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
    // Un poder sin campo no se puede crear: lo dice el formulario.
    await page.getByRole('tab', { name: 'Campos y poderes' }).click();
    await page.getByRole('link', { name: '+ Nuevo poder' }).click();
    await page.getByRole('textbox', { name: /^Nombre/ }).fill('Poder sin campo');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Todo poder pertenece a un campo')).toBeVisible();
  });
});
