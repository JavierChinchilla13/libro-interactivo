import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Las pantallas se descargan al entrar (código dividido): con toda la suite en paralelo tardan más de 1 s en cargar.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
