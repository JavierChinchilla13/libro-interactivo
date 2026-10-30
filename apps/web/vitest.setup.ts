import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Las pantallas se descargan al entrar (código dividido): con toda la suite en paralelo tardan más de 1 s en cargar.
configure({ asyncUtilTimeout: 5000 });

// Las pruebas parten de «hay una sesión que preguntar» (la cookie-pista que pone el servidor); las que prueban la visita
// anónima la borran.
beforeEach(() => {
  // (Las pruebas de `vite/` corren sin navegador simulado.)
  if (typeof document !== 'undefined') document.cookie = 'libro_s=1; path=/';
});

afterEach(() => {
  cleanup();
});
