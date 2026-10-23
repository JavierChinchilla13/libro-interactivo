import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FIELD_VISUAL_KEYS } from '@libro/shared';
import { FieldEmblem } from './FieldEmblem';

describe('FieldEmblem', () => {
  it.each(FIELD_VISUAL_KEYS)('con la clave «%s» dice «Tu campo» y el nombre, en texto', (key) => {
    const { container } = render(<FieldEmblem visual={{ key, fieldName: 'Transformación' }} />);
    expect(screen.getByText('Tu campo')).toBeInTheDocument();
    expect(screen.getByText('Transformación')).toBeInTheDocument();
    expect(container.querySelector('.field-emblem')).toHaveAttribute('data-key', key);
    // El círculo es solo decoración y no hay lienzo.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
