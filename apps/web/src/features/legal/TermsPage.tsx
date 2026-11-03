import { ADULT_AGE, LEGAL_CONTACT_EMAIL, MIN_ACCOUNT_AGE } from '@libro/shared';
import { Link } from 'react-router';
import { LegalPage, OwnerName, type LegalSectionDef } from './LegalPage';

const list = 'list-disc space-y-2 pl-5';
const link = 'underline underline-offset-4 decoration-1 hover:text-text';

const SECTIONS: LegalSectionDef[] = [
  {
    id: 'quien',
    title: 'Quién puede usar el sitio',
    body: (
      <>
        <p>
          Para tener una cuenta debes tener {MIN_ACCOUNT_AGE} años o más. Si tienes entre{' '}
          {MIN_ACCOUNT_AGE} y {ADULT_AGE - 1} años, tu madre, padre o tutor debe autorizar el uso de
          tu cuenta y de tus datos. Al crearla lo declaras tú; no verificamos tu edad ni quién
          autoriza.
        </p>
        <p>
          Al crear tu cuenta aceptas estos términos. El uso de tus datos se explica en la{' '}
          <Link className={link} to="/privacidad">
            política de privacidad
          </Link>
          , que aceptas por separado.
        </p>
      </>
    ),
  },
  {
    id: 'cuenta',
    title: 'Tu cuenta',
    body: (
      <ul className={list}>
        <li>Los datos que nos das deben ser verdaderos y tuyos.</li>
        <li>La cuenta es personal. Cuida tu contraseña y no la compartas.</li>
        <li>
          El código QR de tu ejemplar desbloquea contenido para tu cuenta; no está pensado para
          compartirse con otras personas.
        </li>
      </ul>
    ),
  },
  {
    id: 'contenido',
    title: 'Qué es de quién',
    body: (
      <>
        <p>
          Los libros, los textos, las ilustraciones, los quizzes, el juego y el resto del contenido
          del sitio son de la autora o de quienes colaboraron con ella. Puedes leerlos y jugarlos
          para ti. No puedes copiarlos, publicarlos ni usarlos para otros fines sin permiso.
        </p>
        <p>
          Titular de los derechos: <OwnerName />.
        </p>
      </>
    ),
  },
  {
    id: 'uso',
    title: 'Cómo esperamos que se use',
    body: (
      <ul className={list}>
        <li>Sin intentar entrar a cuentas ajenas ni saltarte las protecciones del sitio.</li>
        <li>Sin programas que repitan peticiones o recojan el contenido de forma automática.</li>
        <li>Sin suplantar a otras personas ni escribir mensajes ofensivos o engañosos.</li>
      </ul>
    ),
  },
  {
    id: 'servicio',
    title: 'El servicio',
    body: (
      <>
        <p>
          El sitio puede cambiar, tener errores o interrumpirse por mantenimiento. Podemos suspender
          una cuenta que incumpla estos términos. Puedes borrar la tuya cuando quieras desde{' '}
          <Link className={link} to="/panel/cuenta">
            Panel › Cuenta
          </Link>
          .
        </p>
        {/* Limitación de responsabilidad: redactado sin revisión legal (no hubo abogada; texto dado por la titular). */}
        <p>
          El sitio se ofrece tal como está. Hacemos lo posible por mantenerlo disponible y correcto,
          pero puede tener interrupciones o errores. En la medida en que la ley lo permita, la
          titular no responde por daños indirectos derivados del uso del sitio o de la imposibilidad
          de usarlo, ni por el contenido o el funcionamiento de sitios de terceros enlazados, como
          las tiendas donde se vende el libro. Nada de lo anterior limita los derechos que te
          reconoce la ley como persona consumidora, en particular la Ley N.º 7472 de Costa Rica, ni
          la responsabilidad que legalmente no pueda excluirse.
        </p>
      </>
    ),
  },
  {
    id: 'creditos',
    title: 'Créditos y licencias',
    body: (
      <p>
        Las imágenes, ilustraciones y textos del sitio son obra de la autora o se usan con su
        autorización. No usamos imágenes con derechos de terceros sin permiso. Las tipografías
        Cinzel, Jost y Newsreader se usan bajo la licencia SIL Open Font License.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios, contacto y ley aplicable',
    body: (
      <>
        <p>
          Si estos términos cambian de fondo, cambiará su versión y la publicaremos aquí. Escríbenos
          a{' '}
          <a className={link} href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          Estos términos se rigen por las leyes de la República de Costa Rica, y cualquier
          controversia se someterá a los tribunales de Costa Rica, sin perjuicio de los derechos que
          como persona consumidora te reconozca la ley de tu país de residencia.
        </p>
      </>
    ),
  },
];

/** Términos de uso. Quién puede usar el sitio, qué se espera de la cuenta y de qué es cada contenido. */
export function TermsPage() {
  return (
    <LegalPage
      title="Términos de uso"
      subtitle="Las reglas básicas para usar Universo Memorias."
      current="/terminos"
      sections={SECTIONS}
    />
  );
}
