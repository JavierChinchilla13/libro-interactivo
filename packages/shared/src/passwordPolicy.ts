/**
 * Política de contraseñas (la usan el API para imponerla y la web para avisar antes de enviar).
 * Reglas: longitud mínima, rechazo de contraseñas demasiado comunes o triviales, y de las que
 * repiten datos de la propia cuenta (nombre o parte local del correo).
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordProblem = 'TOO_SHORT' | 'TOO_LONG' | 'TOO_COMMON' | 'TOO_SIMPLE' | 'PERSONAL';

export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  TOO_SHORT: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  TOO_LONG: `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`,
  TOO_COMMON: 'Esa contraseña es demasiado común. Elige otra.',
  TOO_SIMPLE: 'La contraseña es demasiado simple (repeticiones o secuencias).',
  PERSONAL: 'La contraseña no puede contener tu nombre ni tu correo.',
};

/** Contraseñas muy usadas de 10+ caracteres (y variantes típicas del proyecto). Comparación sin mayúsculas ni acentos. */
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '12345678910',
  '123456789012',
  '0987654321',
  '1q2w3e4r5t',
  '1qaz2wsx3e',
  '1qaz2wsx3edc',
  'qwertyuiop',
  'qwertyuiop123',
  'asdfghjkl',
  'asdfghjkl123',
  'zxcvbnm123',
  'qwerty1234',
  'qwerty12345',
  'qwerty123456',
  'abcdefghij',
  'abcd123456',
  'abc1234567',
  'password12',
  'password123',
  'password1234',
  'password12345',
  'password123456',
  'passw0rd123',
  'p@ssword123',
  'p@ssw0rd123',
  'pass123456',
  'contrasena1',
  'contrasena12',
  'contrasena123',
  'contrasena1234',
  'contrasena12345',
  'mipassword',
  'mipassword1',
  'mipassword123',
  'micontrasena',
  'micontrasena1',
  'micontrasena123',
  'clave12345',
  'clave123456',
  'miclave1234',
  'miclave12345',
  'iloveyou123',
  'iloveyou12',
  'teamo12345',
  'teamo123456',
  'tequiero123',
  'tequiero1234',
  'superman123',
  'princesa123',
  'princess123',
  'football123',
  'futbol12345',
  'barcelona123',
  'realmadrid1',
  'realmadrid123',
  'chocolate123',
  'estrella123',
  'mariposa123',
  'abcabcabc1',
  'welcome123',
  'welcome1234',
  'bienvenido1',
  'bienvenido123',
  'administrador',
  'administrador1',
  'administrador123',
  'admin12345',
  'admin123456',
  'adminadmin',
  'adminadmin1',
  'letmein123',
  'changeme123',
  'cambiame123',
  'internet123',
  'computadora1',
  'computadora123',
  'memorias123',
  'memorias1234',
  'memorias2026',
  'memorias2025',
  'libro12345',
  'libro123456',
  'libros12345',
  'libointeractivo',
  'librointeractivo',
  'librointeractivo1',
  'librointeractivo123',
  'costarica123',
  'costarica1234',
  'costarica2026',
  'sanjose12345',
  'pura vida123',
  'puravida123',
  'puravida1234',
  'monkey1234',
  'dragon1234',
  'master1234',
  'shadow1234',
  'sunshine123',
  'trustno1234',
  'whatever123',
  'passwordpassword',
  'contrasenacontrasena',
  'qazwsxedc123',
  'zaq12wsxcde',
  '1111111111',
  '0000000000',
  '123123123123',
  '123456123456',
  '147258369',
  '1472583690',
  '159753456852',
  '9876543210',
  '9876543210a',
  'a1b2c3d4e5',
  'a1b2c3d4e5f6',
]);

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Repetición de un mismo carácter o de un bloque (aaaaaaaaaa, abababababab) o secuencia lineal (abcdefghij, 1234567890). */
function isTooSimple(normalized: string): boolean {
  if (new Set(normalized).size <= 2) return true;
  for (let size = 1; size <= 4; size += 1) {
    const unit = normalized.slice(0, size);
    if (unit.repeat(Math.ceil(normalized.length / size)).startsWith(normalized)) return true;
  }
  const codes = [...normalized].map((c) => c.charCodeAt(0));
  const step = codes[1] !== undefined && codes[0] !== undefined ? codes[1] - codes[0] : 0;
  if (Math.abs(step) === 1) {
    return codes.every((code, i) => i === 0 || code - (codes[i - 1] ?? 0) === step);
  }
  return false;
}

export interface PasswordContext {
  name?: string;
  email?: string;
}

/** Devuelve la lista de problemas de una contraseña (vacía = válida). */
export function checkPassword(password: string, context: PasswordContext = {}): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push('TOO_SHORT');
  if (password.length > PASSWORD_MAX_LENGTH) problems.push('TOO_LONG');

  const normalized = normalize(password);
  if (COMMON_PASSWORDS.has(normalized)) problems.push('TOO_COMMON');
  if (password.length >= PASSWORD_MIN_LENGTH && isTooSimple(normalized))
    problems.push('TOO_SIMPLE');

  const local = context.email?.split('@')[0] ?? '';
  const personal = [...(context.name?.split(/\s+/) ?? []), local, ...local.split(/[._+-]+/)]
    .map(normalize)
    .filter((part) => part.length >= 4);
  if (personal.some((part) => normalized.includes(part))) problems.push('PERSONAL');

  return problems;
}
