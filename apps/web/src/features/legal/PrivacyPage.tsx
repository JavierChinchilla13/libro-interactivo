import { ADULT_AGE, LEGAL_CONTACT_EMAIL, MIN_ACCOUNT_AGE } from '@libro/shared';
import { Link } from 'react-router';
import { LegalPage, OwnerName, type LegalSectionDef } from './LegalPage';
import { ThirdPartyList } from './ThirdParties';

const list = 'list-disc space-y-2 pl-5';
const link = 'underline underline-offset-4 decoration-1 hover:text-text';

const mail = (
  <a className={link} href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
    {LEGAL_CONTACT_EMAIL}
  </a>
);

const SECTIONS: LegalSectionDef[] = [
  {
    id: 'responsable',
    title: 'Quién trata tus datos',
    body: (
      <>
        <p>
          Universo Memorias lo administra <OwnerName />, persona física de Costa Rica. Es quien
          decide para qué se usan tus datos: la persona responsable de la base de datos.
        </p>
        <p>
          El único medio de contacto es el correo {mail}: escríbenos ahí para cualquier duda sobre
          tus datos.
        </p>
      </>
    ),
  },
  {
    id: 'edad',
    title: 'Para quién es este sitio',
    body: (
      <>
        <p>
          El libro y la cuenta son para personas de {MIN_ACCOUNT_AGE} años o más. Si tienes entre{' '}
          {MIN_ACCOUNT_AGE} y {ADULT_AGE - 1} años, tu madre, padre o tutor debe autorizar el uso de
          tu cuenta y de tus datos.
        </p>
        <p>
          Al crear la cuenta nos dices tu edad con tu mes y año de nacimiento y marcando una
          casilla.{' '}
          <strong>Es una declaración tuya: no verificamos tu edad ni quién autoriza.</strong> Si
          descubres una cuenta de alguien menor de {MIN_ACCOUNT_AGE} años, escríbenos y la
          eliminamos.
        </p>
        <p>
          Si tienes menos de {MIN_ACCOUNT_AGE} años, no creamos la cuenta y no guardamos nada de lo
          que escribiste en el formulario.
        </p>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Qué datos guardamos',
    body: (
      <>
        <ul className={list}>
          <li>
            <strong>Para crear tu cuenta (obligatorio):</strong> nombre, correo y contraseña. La
            contraseña se guarda cifrada (con Argon2id): no podemos leerla. Sin estos datos no
            podemos crear la cuenta.
          </li>
          <li>
            <strong>Tu edad y tu autorización (obligatorio):</strong> año y mes de nacimiento, si tu
            madre, padre o tutor autorizó (de {MIN_ACCOUNT_AGE} a {ADULT_AGE - 1} años), y la fecha
            y la versión de la política que aceptaste. No guardamos tu día de nacimiento ni tu edad
            calculada.
          </li>
          <li>
            <strong>Al usar el libro:</strong> los códigos QR que desbloqueaste, tu progreso y los
            resultados de los quizzes y del juego. Se generan solos al usar el sitio y hacen falta
            para que funcione.
          </li>
          <li>
            <strong>Si nos escribes por el formulario de contacto:</strong> tu nombre, tu correo y
            tu mensaje. El mensaje le llega a la autora por correo y, si ese ajuste está activo,
            también se guarda en el sitio. Escribirnos es opcional; los tres campos hacen falta para
            poder responderte.
          </li>
          <li>
            <strong>De tus sesiones (automático):</strong> una huella cifrada de tu dirección IP (no
            la IP en claro) y el nombre de tu navegador, para mantener y cerrar tus sesiones.
          </li>
        </ul>
        <p>
          <strong>Lo que no pedimos:</strong> datos sensibles (salud, religión, opiniones políticas,
          vida u orientación sexual), tu día de nacimiento, tu ubicación ni datos de pago. Las
          compras del libro se hacen en las tiendas a las que enlazamos.
        </p>
        <p>
          Los registros técnicos de nuestro servidor no guardan tu dirección IP. Para frenar
          intentos abusivos, el servidor la usa en memoria, por un tiempo corto (hasta una hora), y
          la descarta. Render y Cloudflare (ver más abajo) pueden guardar la suya.
        </p>
      </>
    ),
  },
  {
    id: 'google',
    title: 'Datos que vienen de Google',
    body: (
      <>
        <p>
          Si eliges «Continuar con Google», Google te pide iniciar sesión con tu cuenta y nos envía
          tu <strong>correo, tu nombre y si ese correo está verificado</strong>. Es todo lo que
          recibimos.
        </p>
        <ul className={list}>
          <li>Lo usamos solo para crear o abrir tu cuenta, igual que si lo hubieras escrito tú.</li>
          <li>
            No pedimos acceso a tu Gmail, tus contactos, tu calendario ni a otra información de tu
            cuenta de Google. No guardamos tu contraseña de Google ni el identificador de tu cuenta
            de Google.
          </li>
          <li>
            No vendemos esa información, no la usamos para publicidad y no la compartimos con
            terceros, salvo con los proveedores que hacen falta para que el sitio funcione (por
            ejemplo, el que envía los correos del servicio).
          </li>
          <li>
            Solo la titular del sitio y su equipo de administración pueden ver tu nombre y tu
            correo, para atender tu cuenta.
          </li>
        </ul>
        <p>
          El uso de la información que recibimos de Google se limita a ofrecer este ingreso y las
          funciones de tu cuenta que ves en el sitio. Google trata tus datos con su propia política:{' '}
          <a className={link} href="https://policies.google.com/privacy" rel="noopener noreferrer">
            política de privacidad de Google
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: 'usos',
    title: 'Para qué los usamos',
    body: (
      <>
        <ul className={list}>
          <li>Crear y mantener tu cuenta, y que puedas entrar.</li>
          <li>Desbloquear el contenido de tu libro y guardar tu progreso.</li>
          <li>
            Enviarte los correos que el servicio necesita (recuperar la contraseña, avisos de
            seguridad).
          </li>
          <li>Responder los mensajes que nos escribes.</li>
          <li>Proteger el sitio de abusos (límites de intentos).</li>
          <li>Contar, sin nombre, cuántas personas completan cada quiz (estadísticas).</li>
        </ul>
        <p>
          No usamos tus datos para publicidad ni para crear perfiles, y{' '}
          <strong>no los vendemos</strong>.
        </p>
      </>
    ),
  },
  {
    id: 'proveedores',
    title: 'Quién más interviene',
    body: (
      <>
        <p>
          Para que el sitio funcione usamos estos proveedores. Cada uno recibe solo lo que necesita
          para su parte. Varios están en otros países: al aceptar esta política autorizas que tus
          datos se guarden con ellos.
        </p>
        <p>Abajo, cada proveedor con su país o región y el enlace a su política.</p>
        <ThirdPartyList />
      </>
    ),
  },
  {
    id: 'conservacion',
    title: 'Cuánto tiempo los guardamos',
    body: (
      <>
        <ul className={list}>
          <li>
            <strong>Tu cuenta y tu progreso:</strong> mientras la cuenta exista. Si la borras tú,
            tus datos personales se borran en el momento.
          </li>
          <li>
            <strong>Si pides el borrado por correo:</strong> en un plazo de 5 días hábiles desde que
            recibimos la solicitud.
          </li>
          <li>
            <strong>Tu sesión en cada dispositivo:</strong> hasta 30 días desde la última vez que
            entraste.
          </li>
          <li>
            <strong>El enlace para recuperar la contraseña:</strong> 30 minutos. Solo guardamos su
            huella cifrada.
          </li>
          <li>
            <strong>Quizzes y partidas sin terminar:</strong> se borran solos a los 7 días (quizzes)
            y a los 30 días (juego).
          </li>
          <li>
            <strong>Mensajes de contacto guardados:</strong> 365 días; pasado ese plazo el sitio los
            borra solo. Si borras tu cuenta, no se borran solos: pídenos por correo que los borremos
            también.
          </li>
          <li>
            <strong>Resultados ya terminados, cuando borras tu cuenta:</strong> se conservan sin tu
            nombre ni tu correo, solo para estadística y sin plazo, porque ya no identifican a
            nadie.
          </li>
          <li>
            <strong>Copias de seguridad:</strong> copias manuales que se guardan hasta 90 días; un
            dato borrado puede seguir en una copia hasta que venza.
          </li>
          <li>
            <strong>Registros de Render y Cloudflare:</strong> Render guarda los registros técnicos
            del servicio 7 días en nuestro plan actual (según su documentación, consultada el 3 de
            noviembre de 2026; si cambiamos de plan puede ser más) y nuestros registros no incluyen
            tu IP. Cloudflare trata datos técnicos de conexión (como la IP) como parte de la red de
            Render, según su propia política, y no tenemos acceso a esos registros.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos y cómo ejercerlos',
    body: (
      <>
        <p>
          Puedes pedirnos, gratis, que te digamos qué datos tenemos de ti, que los corrijamos o que
          los borremos, y puedes retirar tu consentimiento cuando quieras (sin efecto hacia atrás).
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Borrar tu cuenta o retirar tu consentimiento:</strong> entra a{' '}
            <Link className={link} to="/panel/cuenta">
              Panel › Cuenta
            </Link>{' '}
            y elige eliminarla (te pedimos tu contraseña).
          </li>
          <li>
            <strong>Cualquier otra solicitud</strong> (acceso, corrección, mensajes de contacto, una
            cuenta de alguien menor de {MIN_ACCOUNT_AGE} años): escribe a {mail} desde el correo de
            la cuenta, diciendo qué necesitas.
          </li>
          <li>
            Te confirmamos que recibimos tu solicitud, con la fecha, y te respondemos en un plazo de
            5 días hábiles contados desde el día siguiente a recibirla; si te pedimos más
            información, el plazo se detiene.
          </li>
        </ol>
        <p>
          También puede hacerlo tu madre, padre o tutor en tu nombre, acreditando que lo es. Si no
          estás conforme con nuestra respuesta, puedes acudir a la Agencia de Protección de Datos de
          los Habitantes (PRODHAB) de Costa Rica.
        </p>
      </>
    ),
  },
  {
    id: 'seguridad',
    title: 'Seguridad',
    body: (
      <>
        <p>
          Cuidamos tus datos con medidas razonables: conexión cifrada, contraseñas cifradas y acceso
          restringido al equipo. Ninguna medida es infalible. Si ocurriera un incidente de seguridad
          que afecte tus datos, te avisaremos y te diremos qué pasó, qué datos se vieron
          comprometidos y qué hacer, en un plazo de 5 días hábiles desde que lo detectemos.
        </p>
      </>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios y ley aplicable',
    body: (
      <>
        <p>Si este texto cambia de fondo, cambiará su versión y la publicaremos aquí.</p>
        <p>
          Este tratamiento se rige por la Ley N.º 8968 de Protección de la Persona frente al
          Tratamiento de sus Datos Personales y su reglamento.
        </p>
      </>
    ),
  },
];

/** Política de privacidad. Qué datos se guardan, para qué, con quién, cuánto y cómo pedir su borrado. */
export function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      subtitle="Qué datos guardamos de ti, para qué los usamos y cómo pedir que los borremos."
      current="/privacidad"
      sections={SECTIONS}
    />
  );
}
