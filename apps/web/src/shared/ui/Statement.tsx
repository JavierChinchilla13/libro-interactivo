import type { CSSProperties } from 'react';

/**
 * Enunciado de gran escala entre secciones. Cada palabra pasa de atenuada a plena a medida que el enunciado cruza la
 * pantalla (scroll). Sin soporte de animaciones ligadas al scroll, o con «reducir movimiento», todo se ve pleno.
 */
export function Statement({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <div className="statement-band">
      <p className="statement">
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className="statement-word"
            style={{ '--i': index } as CSSProperties}
          >
            {word}
            {index < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </p>
    </div>
  );
}
