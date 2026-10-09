import { Types } from 'mongoose';
import { ExtraAccess } from '../models/ExtraAccess.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { UserProgress } from '../models/UserProgress.js';

/** Identificador fijo que reemplaza a la persona en los intentos que se conservan (nadie lo usa como cuenta). */
export const ANONYMIZED_USER_ID = new Types.ObjectId('000000000000000000000000');

/**
 * Borra los datos personales de una cuenta de lector: la cuenta, sus sesiones, enlaces de
 * recuperación, progreso y accesos. Los intentos **completados** se conservan **anonimizados** (para las
 * estadísticas) y los que estaban en curso se eliminan. Solo se llama para cuentas de lector.
 */
export async function eraseUserData(userId: string | Types.ObjectId): Promise<void> {
  const id = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  await QuizAttempt.deleteMany({ userId: id, status: 'in_progress' });
  await QuizAttempt.updateMany({ userId: id }, { $set: { userId: ANONYMIZED_USER_ID } });
  await Promise.all([
    RefreshToken.deleteMany({ userId: id }),
    PasswordReset.deleteMany({ userId: id }),
    UserProgress.deleteMany({ userId: id }),
    ExtraAccess.deleteMany({ userId: id }),
  ]);
  await User.deleteOne({ _id: id });
}
