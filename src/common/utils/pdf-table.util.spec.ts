import { pdfTableColumnsFromWeights } from './pdf-table.util';

describe('pdfTableColumnsFromWeights', () => {
  it('reparte anchos según pesos y alinea la primera columna a la izquierda', () => {
    const cols = pdfTableColumnsFromWeights(
      ['Plato', 'Margen %', 'Unidades', 'Margen $'],
      [4, 1.5, 1.5, 2],
      400,
      ['left', 'right', 'right', 'right'],
    );

    expect(cols).toHaveLength(4);
    expect(cols[0].width).toBeCloseTo(177.78, 0);
    expect(cols[1].width).toBeCloseTo(66.67, 0);
    expect(cols[0].align).toBe('left');
    expect(cols[3].align).toBe('right');
    expect(cols.reduce((sum, col) => sum + col.width, 0)).toBeCloseTo(400, 5);
  });
});
