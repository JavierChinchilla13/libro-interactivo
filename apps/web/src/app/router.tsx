import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router';
import { RedeemPage } from '../features/access/RedeemPage';
import { AccessPage } from '../features/admin/access/AccessPage';
import { AdminHomePage } from '../features/admin/AdminHomePage';
import { BookFormPage } from '../features/admin/books/BookFormPage';
import { BookListPage } from '../features/admin/books/BookListPage';
import { ExtraFormPage } from '../features/admin/extras/ExtraFormPage';
import { ExtraListPage } from '../features/admin/extras/ExtraListPage';
import { SiteContentPage } from '../features/admin/site/SiteContentPage';
import { WelcomeSettingsPage } from '../features/admin/site/WelcomeSettingsPage';
import { QuizEditorPage } from '../features/admin/quizzes/QuizEditorPage';
import { QuizListPage } from '../features/admin/quizzes/QuizListPage';
import { QuizNewPage } from '../features/admin/quizzes/QuizNewPage';
import { WikiFormPage } from '../features/admin/wiki/WikiFormPage';
import { WikiListPage } from '../features/admin/wiki/WikiListPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { ContactPage } from '../features/contact/ContactPage';
import { HealthPage } from '../features/health/HealthPage';
import { HomePage } from '../features/home/HomePage';
import { AccountPage } from '../features/reader/AccountPage';
import { DashboardPage } from '../features/reader/DashboardPage';
import { ExtraViewPage, ExtrasPage } from '../features/reader/ExtrasPage';
import { QuizPage } from '../features/reader/QuizPage';
import { ResultDetailPage, ResultsPage } from '../features/reader/ResultsPage';
import { RequireAuth, RequireRole } from './guards';
import { AdminLayout } from './layouts/AdminLayout';
import { PanelLayout } from './layouts/PanelLayout';
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
      { path: 'contacto', element: <ContactPage /> },
      { path: 'ingresar', element: <LoginPage /> },
      { path: 'registro', element: <RegisterPage /> },
      { path: 'olvide-mi-contrasena', element: <ForgotPasswordPage /> },
      { path: 'restablecer/:token', element: <ResetPasswordPage /> },
      { path: 'u/:token', element: <RedeemPage /> },
      { path: '*', element: <p className="text-muted">Página no encontrada.</p> },
    ],
  },
  {
    // Panel del lector: cualquier persona con sesión (el servidor valida cada acceso a su contenido).
    element: <RequireAuth />,
    children: [
      {
        path: 'panel',
        element: <PanelLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'quiz/:quizId', element: <QuizPage /> },
          { path: 'resultados', element: <ResultsPage /> },
          { path: 'resultados/:quizId', element: <ResultDetailPage /> },
          { path: 'extras', element: <ExtrasPage /> },
          { path: 'extras/:extraId', element: <ExtraViewPage /> },
          { path: 'cuenta', element: <AccountPage /> },
        ],
      },
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
              { path: 'sitio', element: <SiteContentPage /> },
              { path: 'bienvenida', element: <WelcomeSettingsPage /> },
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
