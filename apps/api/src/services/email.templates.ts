import { escapeHtml, singleLine } from '../lib/html.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = 'Universo Memorias';

/** Marco común: tipografía del sistema y colores neutros (la identidad visual llega en la fase 12). */
function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#1f2328;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d8dce1;border-radius:12px;padding:28px;">
      <p style="margin:0 0 4px;font-size:13px;color:#5b636d;">${escapeHtml(BRAND)} · universo Memorias</p>
      <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(title)}</h1>
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#444b55;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

export function passwordResetEmail(input: {
  name: string;
  link: string;
  ttlMinutes: number;
}): RenderedEmail {
  const name = singleLine(input.name);
  const html = layout(
    'Restablece tu contraseña',
    `<p>Hola ${escapeHtml(name)},</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Usa el siguiente botón para elegir una nueva. El enlace funciona <strong>una sola vez</strong> y caduca en ${input.ttlMinutes} minutos.</p>
      ${button(input.link, 'Elegir una nueva contraseña')}
      <p style="font-size:13px;color:#5b636d;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>${escapeHtml(input.link)}</p>
      <p style="font-size:13px;color:#5b636d;">Si tú no lo pediste, ignora este mensaje: tu contraseña actual sigue siendo la misma.</p>`,
  );
  const text = `Hola ${name},

Recibimos una solicitud para restablecer la contraseña de tu cuenta. Abre este enlace para elegir una nueva (funciona una sola vez y caduca en ${input.ttlMinutes} minutos):

${input.link}

Si tú no lo pediste, ignora este mensaje: tu contraseña actual sigue siendo la misma.`;
  return { subject: `Restablece tu contraseña de ${BRAND}`, html, text };
}

export function passwordChangedEmail(input: { name: string; changedAt: Date }): RenderedEmail {
  const name = singleLine(input.name);
  const when = input.changedAt.toLocaleString('es-CR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Costa_Rica',
  });
  const html = layout(
    'Tu contraseña fue cambiada',
    `<p>Hola ${escapeHtml(name)},</p>
      <p>Te confirmamos que la contraseña de tu cuenta se cambió el ${escapeHtml(when)} (hora de Costa Rica). Por seguridad, se cerraron las demás sesiones abiertas.</p>
      <p style="font-size:13px;color:#5b636d;">Si no fuiste tú, restablece tu contraseña de inmediato desde la opción «¿Olvidaste tu contraseña?» y avísale a la autora por el formulario de contacto.</p>`,
  );
  const text = `Hola ${name},

Te confirmamos que la contraseña de tu cuenta se cambió el ${when} (hora de Costa Rica). Por seguridad, se cerraron las demás sesiones abiertas.

Si no fuiste tú, restablece tu contraseña de inmediato desde «¿Olvidaste tu contraseña?» y avísale a la autora por el formulario de contacto.`;
  return { subject: `Tu contraseña de ${BRAND} fue cambiada`, html, text };
}

export function contactMessageEmail(input: {
  name: string;
  email: string;
  message: string;
  receivedAt: Date;
}): RenderedEmail {
  const name = singleLine(input.name);
  const when = input.receivedAt.toLocaleString('es-CR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Costa_Rica',
  });
  // El mensaje es texto de un desconocido: se escapa y se respetan sus saltos de línea.
  const messageHtml = escapeHtml(input.message).replace(/\r?\n/g, '<br>');
  const html = layout(
    'Nuevo mensaje de contacto',
    `<p><strong>De:</strong> ${escapeHtml(name)} &lt;${escapeHtml(input.email)}&gt;<br>
      <strong>Recibido:</strong> ${escapeHtml(when)}</p>
      <div style="border-left:3px solid #d8dce1;padding:4px 14px;margin:16px 0;">${messageHtml}</div>
      <p style="font-size:13px;color:#5b636d;">Puedes responder directamente a este correo: la respuesta le llegará a ${escapeHtml(name)}.</p>`,
  );
  const text = `Nuevo mensaje de contacto

De: ${name} <${input.email}>
Recibido: ${when}

${input.message}

Puedes responder directamente a este correo: la respuesta le llegará a ${name}.`;
  return { subject: `Nuevo mensaje de contacto de ${name}`, html, text };
}

/** Aviso a la administradora cada vez que se descarga un respaldo con su cuenta (D9). */
export function backupDownloadedEmail(input: { name: string; at: Date }): RenderedEmail {
  const name = singleLine(input.name);
  const when = input.at.toLocaleString('es-CR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Costa_Rica',
  });
  const html = layout(
    'Se descargó un respaldo del sitio',
    `<p>Hola ${escapeHtml(name)},</p>
      <p>Con tu cuenta se descargó un respaldo cifrado de toda la base de datos del sitio el ${escapeHtml(when)} (hora de Costa Rica).</p>
      <p>Si fuiste tú, guarda el archivo y su contraseña en un lugar seguro y bórralo a los 90 días.</p>
      <p style="font-size:13px;color:#5b636d;"><strong>Si no fuiste tú</strong>, cambia tu contraseña de inmediato desde «¿Olvidaste tu contraseña?», revisa en el panel quién tiene cuentas de administración y avísale al desarrollador.</p>`,
  );
  const text = `Hola ${name},

Con tu cuenta se descargó un respaldo cifrado de toda la base de datos del sitio el ${when} (hora de Costa Rica).

Si fuiste tú, guarda el archivo y su contraseña en un lugar seguro y bórralo a los 90 días.

Si no fuiste tú, cambia tu contraseña de inmediato desde «¿Olvidaste tu contraseña?», revisa en el panel quién tiene cuentas de administración y avísale al desarrollador.`;
  return { subject: `Se descargó un respaldo de ${BRAND}`, html, text };
}

/** Doble confirmación de los correos de novedades (solo para cuentas cuyo correo aún no se comprobó). */
export function newsletterConfirmEmail(input: {
  name: string;
  link: string;
  ttlDays: number;
}): RenderedEmail {
  const name = singleLine(input.name);
  const html = layout(
    'Confirma que quieres recibir novedades',
    `<p>Hola ${escapeHtml(name)},</p>
      <p>Pediste recibir correos con novedades de la autora (actualizaciones y capítulos extra). Para empezar a recibirlos, confirma que este correo es tuyo:</p>
      ${button(input.link, 'Sí, quiero recibir novedades')}
      <p style="font-size:13px;color:#5b636d;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>${escapeHtml(input.link)}</p>
      <p style="font-size:13px;color:#5b636d;">El enlace caduca en ${input.ttlDays} días. Si tú no lo pediste, ignora este mensaje: no te apuntaremos a nada.</p>`,
  );
  const text = `Hola ${name},

Pediste recibir correos con novedades de la autora (actualizaciones y capítulos extra). Para empezar a recibirlos, confirma que este correo es tuyo abriendo este enlace (caduca en ${input.ttlDays} días):

${input.link}

Si tú no lo pediste, ignora este mensaje: no te apuntaremos a nada.`;
  return { subject: `Confirma tus correos de novedades de ${BRAND}`, html, text };
}
