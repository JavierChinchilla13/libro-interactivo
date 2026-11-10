import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WelcomeContent, splitPages } from './WelcomeContent';

describe('splitPages', () => {
  it('sin separadores, una sola página igual que antes', () => {
    expect(splitPages('<p>Hola</p><p>Pacto</p>')).toEqual(['<p>Hola</p><p>Pacto</p>']);
  });

  it('parte en cada <hr> (con o sin barra) y descarta las páginas vacías', () => {
    expect(splitPages('<hr><p>A</p><hr /><hr><p>B</p><HR class="x"><p> </p>')).toEqual([
      '<p>A</p>',
      '<p>B</p>',
    ]);
  });

  it('una página que solo trae una imagen cuenta', () => {
    expect(splitPages('<p>A</p><hr><img src="https://res.cloudinary.com/x/a.png">')).toHaveLength(
      2,
    );
  });
});

describe('vista previa del editor (sin cerrar)', () => {
  it('no toma el foco y «Comenzar» vuelve a la primera página', async () => {
    render(<WelcomeContent title="Bienvenida" bodyHtml="<p>Uno</p><hr><p>Dos</p>" />);
    const next = screen.getByRole('button', { name: 'Siguiente ›' });
    expect(next).not.toHaveFocus();
    await userEvent.click(next);
    await userEvent.click(screen.getByRole('button', { name: 'Comenzar' }));
    expect(screen.getByText('Uno').closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
  });

  it('sin separadores y sin cierre no muestra botones', () => {
    render(<WelcomeContent bodyHtml="<p>Uno</p>" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Bienvenida' })).toBeInTheDocument();
  });
});
