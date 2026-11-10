import { Types } from 'mongoose';
import { ExtraAccess } from '../models/ExtraAccess.js';
import { GameSession } from '../models/GameSession.js';
import { NotificationDelivery } from '../models/NotificationDelivery.js';
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
  // Las partidas del juego siguen la misma regla: la que está en curso se elimina y las terminadas quedan sin nombre.
  await GameSession.deleteMany({ userId: id, status: 'in_progress' });
  await GameSession.updateMany({ userId: id }, { $set: { userId: ANONYMIZED_USER_ID } });
  await Promise.all([
    RefreshToken.deleteMany({ userId: id }),
    PasswordReset.deleteMany({ userId: id }),
    UserProgress.deleteMany({ userId: id }),
    ExtraAccess.deleteMany({ userId: id }),
    // Las filas de los avisos por correo (sin correos, pero ligadas a la cuenta).
    NotificationDelivery.deleteMany({ userId: id }),
  ]);
  await User.deleteOne({ _id: id });
}
