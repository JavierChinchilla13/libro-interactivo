import type { createAccountController } from './account.controller.js';

/** Controlador de cuenta ya construido (lo comparten las rutas `/me` y `/auth/change-password`). */
export type AccountController = ReturnType<typeof createAccountController>;
