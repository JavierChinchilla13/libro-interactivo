import { ADULT_AGE, LEGAL_CONTACT_EMAIL, MIN_ACCOUNT_AGE } from '@libro/shared';
import { Link } from 'react-router';
import { LegalPage, LegalSection, Placeholder } from './LegalPage';
import { ThirdPartyTable } from './ThirdParties';

const list = 'list-disc space-y-1.5 pl-5';

/** Política de privacidad (borrador). Qué datos se guardan, para qué, con quién, cuánto y cómo pedir su borrado. */
export function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      subtitle="Qué datos guardamos de ti, para qué los usamos y cómo pedir que los borremos."
      current="/privacidad"
    >
      <LegalSection title="Quién trata tus datos">
        <p>
          El sitio Universo Memorias lo administra{' '}
          <Placeholder>nombre completo o razón social del titular</Placeholder>, con domicilio en{' '}
          <Placeholder>domicilio del titular</Placeholder>. Para cualquier duda sobre tus datos
          escribe a{' '}
          <a className="underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Para quién es este sitio">
        <p>
          El libro y la cuenta son para personas de {MIN_ACCOUNT_AGE} años o más. Si tienes entre{' '}
          {MIN_ACCOUNT_AGE} y {ADULT_AGE - 1} años, tu madre, padre o tutor debe autorizar el uso de
          tu cuenta y de tus datos.
        </p>
        <p>
          Al crear la cuenta nos dices tu edad marcando una casilla y eligiendo tu mes y año de
          nacimiento.{' '}
          <strong>Es una declaración tuya: no verificamos tu edad ni quién autoriza.</strong> Por
          eso, si descubres una cuenta de alguien menor de {MIN_ACCOUNT_AGE} años, escríbenos y la
          eliminamos.
        </p>
        <p>
          Si tienes menos de {MIN_ACCOUNT_AGE} años, no creamos la cuenta y no guardamos nada de lo
          que escribiste en el formulario.
        </p>
      </LegalSection>

      <LegalSection title="Qué datos guardamos">
        <ul className={list}>
          <li>
            <strong>De tu cuenta:</strong> nombre, correo y contraseña. La contraseña se guarda
            cifrada (con Argon2id): no podemos leerla.
          </li>
          <li>
            <strong>De tu edad y tu aceptación:</strong> año y mes de nacimiento, si tu madre, padre
            o tutor autorizó (de {MIN_ACCOUNT_AGE} a {ADULT_AGE - 1} años), y la fecha y la versión
            de los textos que aceptaste. No guardamos tu día de nacimiento ni tu edad calculada.
          </li>
          <li>
            <strong>Si entras con Google:</strong> tu correo, tu nombre y tu identificador de
            Google. No recibimos tu contraseña de Google.
          </li>
          <li>
            <strong>De tu uso del libro:</strong> los códigos QR que desbloqueaste, tu progreso y
            los resultados de los quizzes y del juego.
          </li>
          <li>
            <strong>Si nos escribes por el formulario de contacto:</strong> tu nombre, tu correo y
            tu mensaje. Le llegan a la autora por correo y, si ese ajuste está activo, también se
            guardan en el sitio.
          </li>
          <li>
            <strong>De tus sesiones:</strong> una huella cifrada de tu dirección IP (no la IP en
            claro) y el nombre de tu navegador, para poder mantener y cerrar tus sesiones.
          </li>
        </ul>
        <p>
          Los registros técnicos de nuestro servidor no guardan tu dirección IP. Para frenar
          intentos abusivos, el servidor la usa unos minutos en memoria y la descarta. Aun así,
          Render y Cloudflare (ver abajo) pueden guardar la suya.
        </p>
      </LegalSection>

      <LegalSection title="Para qué los usamos">
        <ul className={list}>
          <li>Crear y mantener tu cuenta, y que puedas entrar.</li>
          <li>Desbloquear el contenido de tu libro y guardar tu progreso.</li>
          <li>
            Enviarte los correos que el servicio necesita (recuperar la contraseña, avisos de
            seguridad).
          </li>
          <li>Responder los mensajes que nos escribes.</li>
          <li>Proteger el sitio de abusos (límites de intentos).</li>
        </ul>
        <p>
          No usamos tus datos para publicidad ni para crear perfiles, y{' '}
          <strong>no los vendemos</strong>.
        </p>
      </LegalSection>

      <LegalSection title="Quién más interviene">
        <p>
          Para que el sitio funcione usamos estos proveedores. Cada uno recibe solo lo que necesita
          para su parte.
        </p>
        <ThirdPartyTable />
      </LegalSection>

      <LegalSection title="Cuánto tiempo los guardamos">
        <ul className={list}>
          <li>
            Tu cuenta y tu progreso, mientras la cuenta exista. Puedes borrarla cuando quieras.
          </li>
          <li>Tu sesión en cada dispositivo, hasta 30 días.</li>
          <li>
            Los mensajes de contacto guardados en el sitio, durante{' '}
            <Placeholder>plazo en días</Placeholder>. El sitio permite configurarlo.
          </li>
          <li>
            Los resultados de quizzes ya completados, cuando borras tu cuenta, se conservan sin tu
            nombre ni tu correo, solo para estadística.{' '}
            <Placeholder>confirmar con la autora si esto se mantiene</Placeholder>
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Tus datos, en tus manos">
        <p>
          Puedes pedirnos que te digamos qué datos tenemos de ti, que los corrijamos o que los
          borremos.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <strong>Borrar tu cuenta:</strong> entra a{' '}
            <Link className="underline" to="/panel/cuenta">
              Panel › Cuenta
            </Link>{' '}
            y elige eliminarla (te pedimos tu contraseña). Se borran tus datos personales.
          </li>
          <li>
            <strong>Cualquier otra solicitud</strong> (acceso, corrección, mensajes de contacto, una
            cuenta de alguien menor de {MIN_ACCOUNT_AGE} años): escribe a{' '}
            <a className="underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
              {LEGAL_CONTACT_EMAIL}
            </a>{' '}
            desde el correo de la cuenta, diciendo qué necesitas.
          </li>
          <li>
            Respondemos en un plazo de <Placeholder>plazo de respuesta</Placeholder>.
          </li>
        </ol>
      </LegalSection>

      <LegalSection title="Seguridad">
        <p>
          Cuidamos tus datos con medidas razonables: conexión cifrada, contraseñas cifradas y acceso
          restringido al equipo. Ninguna medida es infalible.
        </p>
      </LegalSection>

      <LegalSection title="Cambios y ley aplicable">
        <p>
          Si este texto cambia de fondo, cambiará su versión y la publicaremos aquí. Ley aplicable y
          autoridad competente: <Placeholder>a definir con la asesoría legal</Placeholder>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
