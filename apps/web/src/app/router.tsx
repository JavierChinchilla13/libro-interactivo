import type { ComponentType } from 'react';
import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router';
import { HomePage } from '../features/home/HomePage';
import { RequireAuth, RequireRole } from './guards';
import { PublicLayout } from './layouts/PublicLayout';
import { NotFoundPage } from './NotFoundPage';

/**
 * Pantalla con carga diferida (código dividido): se descarga al entrar a la ruta. Así la página principal no trae
 * el panel de administración, el editor de texto ni las pantallas del lector (rendimiento en el celular).
 */
function page<M extends Record<string, unknown>>(
  load: () => Promise<M>,
  name: keyof M & string,
): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await load())[name] as ComponentType }) };
}

/**
 * Tabla de rutas. Zonas: públicas, lector (`/panel`, RequireAuth; fase 9) y
 * administración (`/admin`, RequireAuth + RequireRole). Los guards solo mejoran la experiencia: la seguridad es del API.
 */
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'estado', ...page(() => import('../features/health/HealthPage'), 'HealthPage') },
      {
        path: 'actualizaciones',
        ...page(() => import('../features/posts/PostsPage'), 'PostsPage'),
      },
      {
        path: 'actualizaciones/:slug',
        ...page(() => import('../features/posts/PostPage'), 'PostPage'),
      },
      {
        path: 'fan-arts',
        ...page(() => import('../features/community/FanArtsPage'), 'FanArtsPage'),
      },
      {
        path: 'contacto',
        ...page(() => import('../features/contact/ContactPage'), 'ContactPage'),
      },
      {
        path: 'libros/:slug',
        ...page(() => import('../features/book/BookPage'), 'BookPage'),
      },
      { path: 'wiki', ...page(() => import('../features/wiki/WikiPage'), 'WikiPage') },
      // Carga diferida como el resto; quien llega directo a una ficha recibe su código por una precarga que añade el
      // build a `index.html` (plugin `preloadDirectPageChunks` de vite.config.ts).
      {
        path: 'wiki/entrada/:entryId',
        ...page(() => import('../features/wiki/WikiEntryPage'), 'WikiEntryPage'),
      },
      { path: 'wiki/:section', ...page(() => import('../features/wiki/WikiPage'), 'WikiPage') },
      { path: 'ingresar', ...page(() => import('../features/auth/LoginPage'), 'LoginPage') },
      { path: 'registro', ...page(() => import('../features/auth/RegisterPage'), 'RegisterPage') },
      {
        path: 'olvide-mi-contrasena',
        ...page(() => import('../features/auth/ForgotPasswordPage'), 'ForgotPasswordPage'),
      },
      {
        path: 'restablecer/:token',
        ...page(() => import('../features/auth/ResetPasswordPage'), 'ResetPasswordPage'),
      },
      { path: 'u/:token', ...page(() => import('../features/access/RedeemPage'), 'RedeemPage') },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    // Panel del lector: cualquier persona con sesión (el servidor valida cada acceso a su contenido).
    element: <RequireAuth />,
    children: [
      {
        path: 'panel',
        ...page(() => import('./layouts/PanelLayout'), 'PanelLayout'),
        children: [
          {
            index: true,
            ...page(() => import('../features/reader/DashboardPage'), 'DashboardPage'),
          },
          {
            // Un libro dentro del panel: migas y subnavegador (BookShell) con Resumen, Resultados y Extras.
            path: 'libros/:slug',
            ...page(() => import('../features/reader/BookShell'), 'BookShell'),
            children: [
              {
                index: true,
                ...page(() => import('../features/reader/BookPanelPage'), 'BookPanelPage'),
              },
              {
                path: 'resultados',
                ...page(() => import('../features/reader/ResultsPage'), 'ResultsPage'),
              },
              {
                path: 'extras',
                ...page(() => import('../features/reader/ExtrasPage'), 'ExtrasPage'),
              },
            ],
          },
          {
            path: 'quiz/:quizId',
            ...page(() => import('../features/reader/QuizPage'), 'QuizPage'),
          },
          {
            path: 'juego/:bookId',
            ...page(() => import('../features/game/GamePage'), 'GamePage'),
          },
          {
            // Punto de acceso: elige un libro (con uno solo abierto va directo a sus resultados).
            path: 'resultados',
            ...page(() => import('../features/reader/BookAccessPage'), 'ResultsAccessPage'),
          },
          {
            path: 'resultados/:quizId',
            ...page(() => import('../features/reader/ResultsPage'), 'ResultDetailPage'),
          },
          {
            // Punto de acceso: elige un libro (con uno solo abierto va directo a sus extras).
            path: 'extras',
            ...page(() => import('../features/reader/BookAccessPage'), 'ExtrasAccessPage'),
          },
          {
            path: 'extras/:extraId',
            ...page(() => import('../features/reader/ExtrasPage'), 'ExtraViewPage'),
          },
          {
            path: 'cuenta',
            ...page(() => import('../features/reader/AccountPage'), 'AccountPage'),
          },
        ],
      },
    ],
  },
  {
    // Editoras y administradoras. Las secciones solo de ADMIN (QR, usuarios…) van bajo otro `RequireRole`.
    element: <RequireAuth />,
    children: [
      {
        element: <RequireRole roles={['EDITOR', 'ADMIN']} />,
        children: [
          {
            path: 'admin',
            ...page(() => import('./layouts/AdminLayout'), 'AdminLayout'),
            children: [
              {
                index: true,
                ...page(() => import('../features/admin/AdminHomePage'), 'AdminHomePage'),
              },
              {
                path: 'libros',
                ...page(() => import('../features/admin/books/BookListPage'), 'BookListPage'),
              },
              {
                path: 'libros/nuevo',
                ...page(() => import('../features/admin/books/BookFormPage'), 'BookFormPage'),
              },
              {
                path: 'libros/:bookId',
                ...page(() => import('../features/admin/books/BookFormPage'), 'BookFormPage'),
              },
              {
                path: 'quizzes',
                ...page(() => import('../features/admin/quizzes/QuizListPage'), 'QuizListPage'),
              },
              {
                path: 'quizzes/nuevo',
                ...page(() => import('../features/admin/quizzes/QuizNewPage'), 'QuizNewPage'),
              },
              {
                path: 'quizzes/:quizId',
                ...page(() => import('../features/admin/quizzes/QuizEditorPage'), 'QuizEditorPage'),
              },
              {
                path: 'wiki',
                ...page(() => import('../features/admin/wiki/WikiListPage'), 'WikiListPage'),
              },
              {
                path: 'wiki/nueva',
                ...page(() => import('../features/admin/wiki/WikiFormPage'), 'WikiFormPage'),
              },
              {
                path: 'wiki/:entryId',
                ...page(() => import('../features/admin/wiki/WikiFormPage'), 'WikiFormPage'),
              },
              {
                path: 'actualizaciones',
                ...page(() => import('../features/admin/posts/PostListPage'), 'PostListPage'),
              },
              {
                path: 'actualizaciones/nueva',
                ...page(() => import('../features/admin/posts/PostFormPage'), 'PostFormPage'),
              },
              {
                path: 'actualizaciones/:postId',
                ...page(() => import('../features/admin/posts/PostFormPage'), 'PostFormPage'),
              },
              {
                path: 'fan-arts',
                ...page(() => import('../features/admin/community/FanArtPages'), 'FanArtListPage'),
              },
              {
                path: 'fan-arts/nuevo',
                ...page(() => import('../features/admin/community/FanArtPages'), 'FanArtFormPage'),
              },
              {
                path: 'fan-arts/:fanArtId',
                ...page(() => import('../features/admin/community/FanArtPages'), 'FanArtFormPage'),
              },
              {
                path: 'resenas',
                ...page(() => import('../features/admin/community/ReviewPages'), 'ReviewListPage'),
              },
              {
                path: 'resenas/nueva',
                ...page(() => import('../features/admin/community/ReviewPages'), 'ReviewFormPage'),
              },
              {
                path: 'resenas/:reviewId',
                ...page(() => import('../features/admin/community/ReviewPages'), 'ReviewFormPage'),
              },
              {
                path: 'sitio',
                ...page(() => import('../features/admin/site/SiteContentPage'), 'SiteContentPage'),
              },
              {
                path: 'bienvenida',
                ...page(
                  () => import('../features/admin/site/WelcomeSettingsPage'),
                  'WelcomeSettingsPage',
                ),
              },
              {
                path: 'extras',
                ...page(() => import('../features/admin/extras/ExtraListPage'), 'ExtraListPage'),
              },
              {
                path: 'extras/nuevo',
                ...page(() => import('../features/admin/extras/ExtraFormPage'), 'ExtraFormPage'),
              },
              {
                path: 'extras/:extraId',
                ...page(() => import('../features/admin/extras/ExtraFormPage'), 'ExtraFormPage'),
              },
              // Solo administradoras (los códigos de acceso no los gestionan las editoras).
              {
                element: <RequireRole roles={['ADMIN']} />,
                children: [
                  {
                    path: 'qr',
                    ...page(() => import('../features/admin/access/AccessPage'), 'AccessPage'),
                  },
                  {
                    path: 'usuarios',
                    ...page(() => import('../features/admin/ops/UserPages'), 'UserListPage'),
                  },
                  {
                    path: 'usuarios/:userId',
                    ...page(() => import('../features/admin/ops/UserPages'), 'UserDetailPage'),
                  },
                  {
                    path: 'mensajes',
                    ...page(() => import('../features/admin/ops/MessagesPage'), 'MessagesPage'),
                  },
                  {
                    path: 'estadisticas',
                    ...page(() => import('../features/admin/ops/StatsPage'), 'StatsPage'),
                  },
                  {
                    path: 'ajustes',
                    ...page(
                      () => import('../features/admin/ops/ContactSettingsPage'),
                      'ContactSettingsPage',
                    ),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
export const createTestRouter = (initialEntries: string[]) =>
  createMemoryRouter(routes, { initialEntries });
