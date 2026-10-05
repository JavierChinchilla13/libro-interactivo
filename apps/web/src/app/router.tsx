import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router';
import { HealthPage } from '../features/health/HealthPage';
import { HomePage } from '../features/home/HomePage';
import { PublicLayout } from './layouts/PublicLayout';

/**
 * Tabla de rutas. Zonas previstas: públicas, lector (`/panel`, RequireAuth)
 * y administración (`/admin`, RequireRole). Los guards se agregan en las fases 3 y 7.
 */
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'estado', element: <HealthPage /> },
      { path: '*', element: <p className="text-muted">Página no encontrada.</p> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
export const createTestRouter = (initialEntries: string[]) =>
  createMemoryRouter(routes, { initialEntries });
