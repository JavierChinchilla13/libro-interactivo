/**
 * El carril de lectura: una línea vertical en el margen izquierdo de la página que se dibuja a medida que la persona
 * avanza (scroll). Cada sección pone un punto sobre ella (`.section-node`) que se enciende al llegar. Es decorativa
 * (`aria-hidden`) y solo se muestra donde el navegador sabe ligar animaciones al scroll; sin eso, o con «reducir
 * movimiento», no aparece. Va dentro de un contenedor `.page-rail-host` (su posición relativa).
 */
export function PageRail() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 2 100"
      preserveAspectRatio="none"
      className="page-rail"
      focusable="false"
    >
      <line
        x1="1"
        y1="0"
        x2="1"
        y2="100"
        pathLength={1}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="page-rail-track"
      />
      <line
        x1="1"
        y1="0"
        x2="1"
        y2="100"
        pathLength={1}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="page-rail-fill"
      />
    </svg>
  );
}
