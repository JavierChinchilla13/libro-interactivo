import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Thread } from './Thread';

const nodesOf = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-node]'));

describe('Thread', () => {
  it('dibuja un punto por nodo y marca encendidos solo los primeros', () => {
    const { container } = render(<Thread nodes={5} litCount={2} />);
    const nodes = nodesOf(container);
    expect(nodes).toHaveLength(5);
    expect(nodes.map((node) => node.getAttribute('data-state'))).toEqual([
      'lit',
      'lit',
      'unlit',
      'unlit',
      'unlit',
    ]);
  });

  it('con nada encendido no dibuja tramo de luz', () => {
    const { container } = render(<Thread nodes={3} litCount={0} />);
    expect(container.querySelector('.thread-lit')).toBeNull();
    expect(nodesOf(container).every((node) => node.getAttribute('data-state') === 'unlit')).toBe(
      true,
    );
  });

  it('el tramo encendido llega hasta el último punto encendido y no se pasa del trazo', () => {
    const { container } = render(<Thread nodes={4} litCount={4} lead={0.3} />);
    const lit = container.querySelector<SVGPathElement>('.thread-lit');
    expect(lit).not.toBeNull();
    const reach = Number.parseFloat((lit?.style.strokeDasharray ?? '').split(' ')[0] ?? '');
    expect(reach).toBeGreaterThan(0.5);
    expect(reach).toBeLessThanOrEqual(1);
  });

  it('es decorativo para lectores de pantalla y solo anima si se pide', () => {
    const quiet = render(<Thread orientation="horizontal" />);
    expect(quiet.container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(quiet.container.querySelector('.thread-animated')).toBeNull();
    const animated = render(<Thread animated />);
    expect(animated.container.querySelector('.thread-animated')).not.toBeNull();
  });

  it('con menos de dos puntos usa dos y con más encendidos que puntos no se rompe', () => {
    const { container } = render(<Thread nodes={1} litCount={9} />);
    expect(nodesOf(container)).toHaveLength(2);
    expect(nodesOf(container).every((node) => node.getAttribute('data-state') === 'lit')).toBe(
      true,
    );
  });
});
