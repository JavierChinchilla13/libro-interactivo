/**
 * Envía un correo de prueba con el proveedor configurado en el entorno (MAIL_PROVIDER), para
 * comprobar las credenciales de Gmail o de Resend sin levantar toda la app. Uso:
 *   npm run mail:test -w apps/api -- destinatario@ejemplo.com
 * Con MAIL_PROVIDER=memory solo muestra el correo en consola (no se envía a nadie).
 */
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { createMailProvider } from '../src/providers/mail/createMailProvider.js';

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('Uso: npm run mail:test -w apps/api -- destinatario@ejemplo.com');
  process.exit(1);
}

const env = parseEnv();
const logger = createLogger({ NODE_ENV: 'development', LOG_LEVEL: 'info' });
console.log(`Proveedor: ${env.MAIL_PROVIDER}`);

try {
  await createMailProvider({ ...env, NODE_ENV: 'development' }, logger).send({
    to,
    subject: 'Prueba de correo de Libro Interactivo',
    text: 'Si lees esto, el envío de correos funciona correctamente.',
    html: '<p>Si lees esto, el envío de correos <strong>funciona correctamente</strong>.</p>',
  });
  console.log(
    env.MAIL_PROVIDER === 'memory'
      ? 'Listo: correo SIMULADO (con MAIL_PROVIDER=memory no se envía a nadie).'
      : `Listo: correo enviado a ${to}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
