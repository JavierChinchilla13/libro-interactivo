import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders, createQueryClient } from './app/providers';
import { createAppRouter } from './app/router';
import { publicApi, publicKeys } from './features/home/api';
import { booksApi, readerKeys } from './features/reader/api';
import './shared/styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');

async function start(container: HTMLElement) {
  const client = createQueryClient();
  // En la portada, los dos datos con los que se pinta (ya pedidos desde `index.html`) se esperan un instante: así el
  // primer pintado ya es el definitivo y la página no se mueve al llegar los textos. Si tardan, se pinta igual.
  if (window.location.pathname === '/') {
    await Promise.race([
      Promise.allSettled([
        client.prefetchQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false }),
        client.prefetchQuery({ queryKey: readerKeys.books, queryFn: booksApi.list }),
      ]),
      new Promise((resolve) => setTimeout(resolve, 400)),
    ]);
  }
  createRoot(container).render(
    <StrictMode>
      <AppProviders client={client}>
        <RouterProvider router={createAppRouter()} />
      </AppProviders>
    </StrictMode>,
  );
}

void start(root);
