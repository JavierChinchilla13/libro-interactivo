import { ADULT_AGE, LEGAL_CONTACT_EMAIL, MIN_ACCOUNT_AGE } from '@libro/shared';
import { Link } from 'react-router';
import { LegalPage, LegalSection, Placeholder } from './LegalPage';

const list = 'list-disc space-y-1.5 pl-5';

/** Términos de uso (borrador). Quién puede usar el sitio, qué se espera de la cuenta y de qué es cada contenido. */
export function TermsPage() {
  return (
    <LegalPage
      title="Términos de uso"
      subtitle="Las reglas básicas para usar Universo Memorias."
      current="/terminos"
    >
      <LegalSection title="Quién puede usar el sitio">
        <p>
          Para tener una cuenta debes tener {MIN_ACCOUNT_AGE} años o más. Si tienes entre{' '}
          {MIN_ACCOUNT_AGE} y {ADULT_AGE - 1} años, tu madre, padre o tutor debe autorizar el uso de
          tu cuenta y de tus datos. Al crearla lo declaras tú; no verificamos tu edad ni quién
          autoriza.
        </p>
        <p>
          Al crear tu cuenta aceptas estos términos y la{' '}
          <Link className="underline" to="/privacidad">
            política de privacidad
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Tu cuenta">
        <ul className={list}>
          <li>Los datos que nos das deben ser verdaderos y tuyos.</li>
          <li>La cuenta es personal. Cuida tu contraseña y no la compartas.</li>
          <li>
            El código QR de tu ejemplar desbloquea contenido para tu cuenta; no está pensado para
            compartirse con otras personas.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Qué es de quién">
        <p>
          Los libros, los textos, las ilustraciones, los quizzes, el juego y el resto del contenido
          del sitio son de la autora o de quienes colaboraron con ella. Puedes leerlos y jugarlos
          para ti. No puedes copiarlos, publicarlos ni usarlos para otros fines sin permiso.
        </p>
        <p>
          Titular de los derechos: <Placeholder>nombre de la autora o del titular</Placeholder>.
        </p>
      </LegalSection>

      <LegalSection title="Cómo esperamos que se use">
        <ul className={list}>
          <li>Sin intentar entrar a cuentas ajenas ni saltarte las protecciones del sitio.</li>
          <li>Sin programas que repitan peticiones o recojan el contenido de forma automática.</li>
          <li>Sin suplantar a otras personas ni escribir mensajes ofensivos o engañosos.</li>
        </ul>
      </LegalSection>

      <LegalSection title="El servicio">
        <p>
          El sitio puede cambiar, tener errores o interrumpirse por mantenimiento. Podemos suspender
          una cuenta que incumpla estos términos. Puedes borrar la tuya cuando quieras desde{' '}
          <Link className="underline" to="/panel/cuenta">
            Panel › Cuenta
          </Link>
          .
        </p>
        <p>
          Limitación de responsabilidad: <Placeholder>a definir con la asesoría legal</Placeholder>.
        </p>
      </LegalSection>

      <LegalSection title="Créditos y licencias">
        <ul className={list}>
          <li>
            Las tipografías (Cinzel, Jost y Newsreader) usan la licencia SIL Open Font License y se
            sirven desde este mismo sitio.
          </li>
          <li>
            Las imágenes son material de la autora o de su equipo; no usamos imágenes con derechos
            de terceros. <Placeholder>créditos de imágenes y de quienes colaboraron</Placeholder>
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cambios, contacto y ley aplicable">
        <p>
          Si estos términos cambian de fondo, cambiará su versión y la publicaremos aquí. Escríbenos
          a{' '}
          <a className="underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Ley aplicable y jurisdicción: <Placeholder>a definir con la asesoría legal</Placeholder>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
