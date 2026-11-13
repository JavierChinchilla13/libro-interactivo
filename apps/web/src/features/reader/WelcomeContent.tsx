import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Button } from '../../shared/ui/controls';

/**
 * Parte el mensaje en páginas por cada separador `<hr>` («Nueva página» del editor). Las páginas vacías (dos
 * separadores seguidos o uno al final) no cuentan. Sin separadores, una sola página: se ve como siempre.
 */
export function splitPages(html: string): string[] {
  const pages = html
    .split(/<hr\b[^>]*>/i)
    .filter((page) => page.replace(/<[^>]*>/g, '').trim() !== '' || /<img\b/i.test(page));
  return pages.length > 0 ? pages : [html];
}

/**
 * Cuerpo del mensaje de bienvenida: título y texto con la letra de lectura, interlineado amplio y aire entre
 * párrafos. Si la autora lo separó en páginas, muestra una a la vez con «‹ Anterior», «Siguiente ›», puntitos de
 * posición y «Comenzar» en la última (también con las flechas del teclado). Lo usan el modal del lector y la vista
 * previa del editor, para que la autora vea lo mismo.
 */
export function WelcomeContent({
  title,
  bodyHtml,
  titleId,
  onDone,
}: {
  title?: string;
  bodyHtml: string;
  /** Id del título (el modal lo usa como `aria-labelledby`). */
  titleId?: string;
  /** Cierra el mensaje. Sin él (vista previa del editor), «Comenzar» vuelve a la primera página. */
  onDone?: () => void;
}) {
  const pages = useMemo(() => splitPages(bodyHtml), [bodyHtml]);
  const [page, setPage] = useState(0);
  // Hacia dónde se movió (para la animación) y si ya se movió alguna vez (la primera página entra sin animar).
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const keepFocusOnNext = useRef(false);
  const current = Math.min(page, pages.length - 1);
  const last = current === pages.length - 1;
  const paged = pages.length > 1;

  useEffect(() => {
    if (direction === null) return;
    const scroller = root.current?.closest('.welcome-dialog');
    if (scroller) scroller.scrollTop = 0;
    // «Anterior» desaparece en la primera página: el foco pasa a «Siguiente» para no perderse.
    if (keepFocusOnNext.current) {
      keepFocusOnNext.current = false;
      next.current?.focus();
    }
  }, [current, direction]);

  function go(target: number) {
    if (target < 0 || target >= pages.length || target === current) return;
    setDirection(target > current ? 'next' : 'prev');
    if (target === 0) keepFocusOnNext.current = true;
    setPage(target);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!paged || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') go(current + 1);
    else if (event.key === 'ArrowLeft') go(current - 1);
    else return;
    event.preventDefault();
  }

  const finish = () => (onDone ? onDone() : go(0));

  return (
    <div ref={root} className="welcome-content" onKeyDown={onKeyDown}>
      <h2 id={titleId} className="section-title welcome-title">
        {title ?? 'Bienvenida'}
      </h2>
      {/* Todas las páginas en la misma celda: el alto es el de la más larga y los botones no se mueven al pasar. */}
      <div className="welcome-pages">
        {pages.map((html, index) => (
          <div
            key={index}
            className="welcome-page"
            data-current={index === current ? 'true' : undefined}
            data-direction={index === current ? (direction ?? undefined) : undefined}
            aria-hidden={index === current ? undefined : true}
            inert={index !== current}
          >
            <SafeHtml html={html} className="welcome-body" />
          </div>
        ))}
      </div>
      {paged ? (
        <div className="welcome-pager">
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            Página {current + 1} de {pages.length}
          </p>
          <div className="welcome-pager-side">
            {current > 0 ? (
              <Button variant="secondary" onClick={() => go(current - 1)}>
                ‹ Anterior
              </Button>
            ) : null}
          </div>
          <ol className="welcome-dots" aria-hidden="true">
            {pages.map((_, index) => (
              <li key={index} data-active={index === current ? 'true' : undefined} />
            ))}
          </ol>
          <div className="welcome-pager-side welcome-pager-end">
            <Button
              ref={next}
              autoFocus={onDone !== undefined}
              onClick={() => (last ? finish() : go(current + 1))}
            >
              {last ? 'Comenzar' : 'Siguiente ›'}
            </Button>
          </div>
        </div>
      ) : onDone ? (
        <div className="welcome-actions">
          <Button autoFocus className="w-full" onClick={onDone}>
            ¡A la aventura!
          </Button>
        </div>
      ) : null}
    </div>
  );
}
