import type PDFDocument from 'pdfkit';

export type PdfDoc = InstanceType<typeof PDFDocument>;

export type PdfTableAlign = 'left' | 'right' | 'center';

export interface PdfTableColumn {
  header: string;
  width: number;
  align?: PdfTableAlign;
}

export interface RenderPdfTableOptions {
  left?: number;
  tableWidth?: number;
  fontSize?: number;
  rowPadding?: number;
  pageBottom?: number;
}

const DEFAULT_LEFT = 50;
const DEFAULT_TABLE_WIDTH = 495;
const DEFAULT_FONT_SIZE = 9;
const DEFAULT_ROW_PADDING = 6;
const DEFAULT_PAGE_BOTTOM = 780;

/** Reparte el ancho total según pesos relativos (ej. [2, 1] → 66% / 33%). */
export function pdfTableColumnsFromWeights(
  headers: string[],
  weights: number[],
  tableWidth = DEFAULT_TABLE_WIDTH,
  aligns?: PdfTableAlign[],
): PdfTableColumn[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  return headers.map((header, index) => ({
    header,
    width: (weights[index] / total) * tableWidth,
    align: aligns?.[index] ?? (index === 0 ? 'left' : 'right'),
  }));
}

function columnX(
  left: number,
  columns: PdfTableColumn[],
  index: number,
): number {
  let x = left;
  for (let i = 0; i < index; i++) {
    x += columns[i].width;
  }
  return x;
}

function cellHeight(
  doc: PdfDoc,
  text: string,
  width: number,
  font: string,
  fontSize: number,
): number {
  doc.font(font).fontSize(fontSize);
  return doc.heightOfString(text, { width: width - 8 });
}

function drawRow(
  doc: PdfDoc,
  columns: PdfTableColumn[],
  cells: string[],
  y: number,
  left: number,
  font: string,
  fontSize: number,
  fillColor: string,
): number {
  doc.font(font).fontSize(fontSize).fillColor(fillColor);

  let maxHeight = 0;
  cells.forEach((cell, index) => {
    const col = columns[index];
    const h = cellHeight(doc, cell, col.width, font, fontSize);
    maxHeight = Math.max(maxHeight, h);
  });

  cells.forEach((cell, index) => {
    const col = columns[index];
    doc.text(cell, columnX(left, columns, index) + 4, y, {
      width: col.width - 8,
      align: col.align ?? (index === 0 ? 'left' : 'right'),
      lineBreak: true,
    });
  });

  return maxHeight;
}

/**
 * Tabla PDF con columnas alineadas — sin `continued` (evita columnas corridas).
 * Actualiza `doc.y` al final de la tabla.
 */
export function renderPdfTable(
  doc: PdfDoc,
  columns: PdfTableColumn[],
  rows: string[][],
  options: RenderPdfTableOptions = {},
): void {
  const left = options.left ?? DEFAULT_LEFT;
  const tableWidth =
    options.tableWidth ?? columns.reduce((sum, col) => sum + col.width, 0);
  const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
  const rowPadding = options.rowPadding ?? DEFAULT_ROW_PADDING;
  const pageBottom = options.pageBottom ?? DEFAULT_PAGE_BOTTOM;

  let y = doc.y;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageBottom) {
      doc.addPage();
      y = doc.y;
    }
  };

  const headerCells = columns.map((col) => col.header);
  const headerHeight = Math.max(
    ...headerCells.map((cell, index) =>
      cellHeight(doc, cell, columns[index].width, 'Helvetica-Bold', fontSize),
    ),
  );

  ensureSpace(headerHeight + rowPadding + 4);
  drawRow(
    doc,
    columns,
    headerCells,
    y,
    left,
    'Helvetica-Bold',
    fontSize,
    '#444444',
  );
  y += headerHeight + 4;

  doc
    .moveTo(left, y)
    .lineTo(left + tableWidth, y)
    .strokeColor('#dddddd')
    .lineWidth(0.5)
    .stroke();
  y += rowPadding;

  for (const row of rows) {
    const rowHeight = Math.max(
      ...row.map((cell, index) =>
        cellHeight(doc, cell, columns[index].width, 'Helvetica', fontSize),
      ),
    );
    ensureSpace(rowHeight + rowPadding);
    drawRow(doc, columns, row, y, left, 'Helvetica', fontSize, '#333333');
    y += rowHeight + rowPadding;
  }

  doc.x = left;
  doc.y = y;
}
