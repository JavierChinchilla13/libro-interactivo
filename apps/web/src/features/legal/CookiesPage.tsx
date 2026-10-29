import { LegalPage, LegalSection } from './LegalPage';

const COOKIES = [
  {
    name: 'libro_at',
    purpose: 'Mantiene tu sesión abierta mientras usas el sitio.',
    duration: 'Unos minutos; se renueva sola mientras tengas sesión.',
  },
  {
    name: 'libro_rt',
    purpose: 'Renueva tu sesión sin pedirte la contraseña otra vez.',
    duration: 'Hasta 30 días. Se borra al cerrar sesión.',
  },
] as const;

const STORAGE = [
  {
    name: 'libro_cookie_notice',
    where: 'Almacenamiento local',
    purpose: 'Recuerda que ya viste el aviso de cookies.',
  },
  {
    name: 'libro_selected_book',
    where: 'Almacenamiento local',
    purpose: 'Recuerda qué libro elegiste en tu panel.',
  },
  {
    name: 'libro_pending_token',
    where: 'Almacenamiento de la sesión del navegador',
    purpose:
      'Guarda el código QR que abriste mientras inicias sesión o creas tu cuenta, hasta que se canjea.',
  },
] as const;

const th = 'py-2 pr-3 font-medium';

/** Política de cookies (borrador). Qué guarda el sitio en tu navegador y qué hace el botón de Google. */
export function CookiesPage() {
  return (
    <LegalPage
      title="Política de cookies"
      subtitle="Qué guarda este sitio en tu navegador y para qué."
      current="/cookies"
    >
      <LegalSection title="En resumen">
        <p>
          Usamos solo cookies necesarias para mantener tu sesión.{' '}
          <strong>No usamos analítica ni publicidad</strong>, y por eso no hay cookies opcionales
          que aceptar o rechazar. Las tipografías se sirven desde este mismo sitio.
        </p>
      </LegalSection>

      <LegalSection title="Cookies que usamos">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <caption className="sr-only">Cookies del sitio</caption>
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className={th}>
                  Cookie
                </th>
                <th scope="col" className={th}>
                  Para qué
                </th>
                <th scope="col" className="py-2 font-medium">
                  Cuánto dura
                </th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((row) => (
                <tr key={row.name} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-3 font-mono font-medium">
                    {row.name}
                  </th>
                  <td className="py-3 pr-3">{row.purpose}</td>
                  <td className="py-3">{row.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Son necesarias: sin ellas no puedes iniciar sesión. El navegador no las deja leer a los
          programas de la página, y solo viajan al servidor del sitio.
        </p>
      </LegalSection>

      <LegalSection title="Lo que guardamos en tu navegador sin ser cookies">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <caption className="sr-only">Almacenamiento del navegador</caption>
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className={th}>
                  Nombre
                </th>
                <th scope="col" className={th}>
                  Dónde
                </th>
                <th scope="col" className="py-2 font-medium">
                  Para qué
                </th>
              </tr>
            </thead>
            <tbody>
              {STORAGE.map((row) => (
                <tr key={row.name} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-3 font-mono font-medium">
                    {row.name}
                  </th>
                  <td className="py-3 pr-3">{row.where}</td>
                  <td className="py-3">{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="Google">
        <p>
          Las pantallas de ingreso y de registro tienen el botón «Continuar con Google». El script
          de Google <strong>no se carga hasta que tocas ese botón</strong>. Al tocarlo, Google puede
          guardar cookies propias, que se rigen por su política y no por esta.
        </p>
      </LegalSection>

      <LegalSection title="Imágenes y videos">
        <p>
          Las imágenes y los videos del sitio se piden a Cloudinary. No instalamos cookies nuestras
          desde ahí, pero tu navegador le envía los datos técnicos de la petición (ver la política
          de privacidad).
        </p>
      </LegalSection>

      <LegalSection title="Cómo borrarlas o bloquearlas">
        <p>
          Puedes borrar o bloquear las cookies desde los ajustes de tu navegador. Si borras o
          bloqueas las de sesión tendrás que iniciar sesión cada vez, y algunas partes del sitio no
          funcionarán.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
