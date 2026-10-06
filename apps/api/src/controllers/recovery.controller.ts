import type { ForgotPasswordRequest, MessageResponse, ResetPasswordRequest } from '@libro/shared';
import type { RequestHandler } from 'express';
import { getInput } from '../middleware/validate.js';
import type { PasswordResetService } from '../services/passwordReset.service.js';

export function createRecoveryController(recovery: PasswordResetService) {
  /** Siempre la misma respuesta, exista o no el correo. */
  const forgotPassword: RequestHandler = async (_req, res) => {
    const { body } = getInput<ForgotPasswordRequest>(res);
    await recovery.requestReset(body.email);
    const response: MessageResponse = {
      message:
        'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
    };
    res.json(response);
  };

  const resetPassword: RequestHandler = async (_req, res) => {
    const { body } = getInput<ResetPasswordRequest>(res);
    await recovery.resetPassword(body);
    const response: MessageResponse = {
      message: 'Tu contraseña se actualizó. Ya puedes iniciar sesión.',
    };
    res.json(response);
  };

  return { forgotPassword, resetPassword };
}
