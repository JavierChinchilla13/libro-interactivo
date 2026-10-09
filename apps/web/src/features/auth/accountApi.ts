import {
  authResponseSchema,
  messageResponseSchema,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type ResetPasswordRequest,
} from '@libro/shared';
import { z } from 'zod';
import { apiRequest } from '../../shared/api/client';

/** Llamadas de cuenta del lector. Los esquemas y las reglas de contraseña son los mismos del servidor. */
export const accountApi = {
  forgotPassword: (body: ForgotPasswordRequest) =>
    apiRequest('/auth/forgot-password', messageResponseSchema, { method: 'POST', body }),
  resetPassword: (body: ResetPasswordRequest) =>
    apiRequest('/auth/reset-password', messageResponseSchema, { method: 'POST', body }),
  changePassword: (body: ChangePasswordRequest) =>
    apiRequest('/auth/change-password', messageResponseSchema, { method: 'POST', body }),
  deleteAccount: (password: string) =>
    apiRequest('/me', z.null(), { method: 'DELETE', body: { password } }),
  updateName: (name: string) =>
    apiRequest('/me', authResponseSchema, { method: 'PATCH', body: { name } }),
};
