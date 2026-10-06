import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router';
import { RedeemPage } from '../features/access/RedeemPage';
import { AccessPage } from '../features/admin/access/AccessPage';
import { AdminHomePage } from '../features/admin/AdminHomePage';
import { BookFormPage } from '../features/admin/books/BookFormPage';
import { BookListPage } from '../features/admin/books/BookListPage';
import { ExtraFormPage } from '../features/admin/extras/ExtraFormPage';
import { ExtraListPage } from '../features/admin/extras/ExtraListPage';
import { QuizEditorPage } from '../features/admin/quizzes/QuizEditorPage';
import { QuizListPage } from '../features/admin/quizzes/QuizListPage';
import { QuizNewPage } from '../features/admin/quizzes/QuizNewPage';
import { WikiFormPage } from '../features/admin/wiki/WikiFormPage';
import { WikiListPage } from '../features/admin/wiki/WikiListPage';
import { LoginPage } from '../features/auth/LoginPage';
import { HealthPage } from '../features/health/HealthPage';
import { HomePage } from '../features/home/HomePage';
import { RequireAuth, RequireRole } from './guards';
import { AdminLayout } from './layouts/AdminLayout';
import { PublicLayout } from './layouts/PublicLayout';

/**
 * Tabla de rutas. Zonas: públicas, lector (`/panel`, RequireAuth; fase 9) y
 * administración (`/admin`, RequireAuth + RequireRole). Los guards solo mejoran la experiencia: la seguridad es del API.
 */
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'estado', element: <HealthPage /> },
      { path: 'ingresar', element: <LoginPage /> },
      { path: 'u/:token', element: <RedeemPage /> },
      { path: '*', element: <p className="text-muted">Página no encontrada.</p> },
    ],
  },
  {
    // Editoras y administradoras. Las secciones solo de ADMIN (QR, usuarios…) irán bajo otro `RequireRole`.
    element: <RequireAuth />,
    children: [
      {
        element: <RequireRole roles={['EDITOR', 'ADMIN']} />,
        children: [
          {
            path: 'admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminHomePage /> },
              { path: 'libros', element: <BookListPage /> },
              { path: 'libros/nuevo', element: <BookFormPage /> },
              { path: 'libros/:bookId', element: <BookFormPage /> },
              { path: 'quizzes', element: <QuizListPage /> },
              { path: 'quizzes/nuevo', element: <QuizNewPage /> },
              { path: 'quizzes/:quizId', element: <QuizEditorPage /> },
              { path: 'wiki', element: <WikiListPage /> },
              { path: 'wiki/nueva', element: <WikiFormPage /> },
              { path: 'wiki/:entryId', element: <WikiFormPage /> },
              { path: 'extras', element: <ExtraListPage /> },
              { path: 'extras/nuevo', element: <ExtraFormPage /> },
              { path: 'extras/:extraId', element: <ExtraFormPage /> },
              // Solo administradoras (los códigos de acceso no los gestionan las editoras).
              {
                element: <RequireRole roles={['ADMIN']} />,
                children: [{ path: 'qr', element: <AccessPage /> }],
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
