import { FactList, type Fact } from './FactList';
import { LegalPage, type LegalSectionDef } from './LegalPage';

const COOKIES: ReadonlyArray<Fact> = [
  {
    name: 'libro_at',
    technical: true,
    rows: [
      ['Para qué', 'Mantiene tu sesión abierta mientras usas el sitio.'],
      ['Cuánto dura', 'Unos minutos; se renueva sola mientras tengas sesión.'],
    ],
  },
  {
    name: 'libro_rt',
    technical: true,
    rows: [
      ['Para qué', 'Renueva tu sesión sin pedirte la contraseña otra vez.'],
      ['Cuánto dura', 'Hasta 30 días. Se borra al cerrar sesión.'],
    ],
  },
  {
    name: 'libro_s',
    technical: true,
    rows: [
      [
        'Para qué',
        'Le avisa a la página que hay una sesión por preguntar, para no pedirla a quien visita sin haber iniciado una. No contiene datos ni da acceso a nada.',
      ],
      ['Cuánto dura', 'Lo mismo que libro_rt. Se borra al cerrar sesión.'],
    ],
  },
];

const STORAGE: ReadonlyArray<Fact> = [
  {
    name: 'libro_cookie_notice',
    technical: true,
    rows: [
      ['Dónde', 'Almacenamiento local'],
      ['Para qué', 'Recuerda que ya viste el aviso de cookies.'],
    ],
  },
  {
    name: 'libro_selected_book',
    technical: true,
    rows: [
      ['Dónde', 'Almacenamiento local'],
      ['Para qué', 'Recuerda qué libro elegiste en tu panel.'],
    ],
  },
  {
    name: 'libro_pending_token',
    technical: true,
    rows: [
      ['Dónde', 'Almacenamiento de la sesión del navegador'],
      [
        'Para qué',
        'Guarda el código QR que abriste mientras inicias sesión o creas tu cuenta, hasta que se canjea.',
      ],
    ],
  },
];

const SECTIONS: LegalSectionDef[] = [
  {
    id: 'resumen',
    title: 'En resumen',
    body: (
      <p>
        Usamos solo cookies necesarias para mantener tu sesión.{' '}
        <strong>No usamos analítica ni publicidad</strong>, y por eso no hay cookies opcionales que
        aceptar o rechazar. Las tipografías se sirven desde este mismo sitio.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies que usamos',
    body: (
      <>
        <FactList items={COOKIES} />
        <p>
          Son necesarias: sin ellas no puedes iniciar sesión. Las dos primeras las guarda el
          servidor de forma que los programas de la página no pueden leerlas. La tercera sí es
          legible, pero solo dice «hay una sesión»: quien la inventara no ganaría nada, porque el
          servidor sigue pidiendo las otras dos.
        </p>
      </>
    ),
  },
  {
    id: 'almacenamiento',
    title: 'Lo que guardamos en tu navegador sin ser cookies',
    body: <FactList items={STORAGE} />,
  },
  {
    id: 'google',
    title: 'Google',
    body: (
      <p>
        Las pantallas de ingreso y de registro tienen el botón «Continuar con Google». El script de
        Google <strong>no se carga hasta que tocas ese botón</strong>. Al tocarlo, Google puede
        guardar cookies propias, que se rigen por su política y no por esta.
      </p>
    ),
  },
  {
    id: 'imagenes',
    title: 'Imágenes y videos',
    body: (
      <p>
        Las imágenes y los videos del sitio se piden a Cloudinary. No instalamos cookies nuestras
        desde ahí, pero tu navegador le envía los datos técnicos de la petición (ver la política de
        privacidad).
      </p>
    ),
  },
  {
    id: 'controlar',
    title: 'Cómo borrarlas o bloquearlas',
    body: (
      <p>
        Puedes borrar o bloquear las cookies desde los ajustes de tu navegador. Si borras o bloqueas
        las de sesión tendrás que iniciar sesión cada vez, y algunas partes del sitio no
        funcionarán.
      </p>
    ),
  },
];

/** Política de cookies (borrador). Qué guarda el sitio en tu navegador y qué hace el botón de Google. */
export function CookiesPage() {
  return (
    <LegalPage
      title="Política de cookies"
      subtitle="Qué guarda este sitio en tu navegador y para qué."
      current="/cookies"
      sections={SECTIONS}
    />
  );
}
