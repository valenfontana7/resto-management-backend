import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  pdfTableColumnsFromWeights,
  renderPdfTable,
  type PdfDoc,
} from '../common/utils/pdf-table.util';

export interface InventoryPdfItem {
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  unitCost: number | null;
  autoDisableDishes: boolean;
  linkedDishNames: string[];
}

export interface InventoryPdfInput {
  restaurantName: string;
  autoDeductOnSale: boolean;
  items: InventoryPdfItem[];
  affectedDishes: Array<{ dishName: string; inventoryItemName: string }>;
}

@Injectable()
export class InventoryPdfService {
  async generateReport(input: InventoryPdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const lowStockCount = input.items.filter(
        (item) => item.currentStock <= item.minStock,
      ).length;

      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .fillColor('#111111')
        .text('Inventario', { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          `${input.restaurantName} · ${new Date().toLocaleDateString('es-AR')}`,
          { align: 'center' },
        );
      doc.moveDown(1.2);

      this.addSection(doc, 'Resumen');
      renderPdfTable(
        doc,
        pdfTableColumnsFromWeights(['Métrica', 'Valor'], [3, 1]),
        [
          ['Insumos registrados', String(input.items.length)],
          ['En quiebre o bajo mínimo', String(lowStockCount)],
          [
            'Descuento automático al cobrar',
            input.autoDeductOnSale ? 'Activo' : 'Inactivo',
          ],
        ],
      );
      doc.moveDown(0.8);

      if (input.items.length === 0) {
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#666666')
          .text('No hay insumos cargados en el inventario.');
      } else {
        this.addSection(doc, 'Listado de insumos');
        renderPdfTable(
          doc,
          pdfTableColumnsFromWeights(
            ['Insumo', 'Stock', 'Mínimo', 'Unidad', 'Costo', 'Estado'],
            [3.2, 1, 1, 1, 1.2, 1.2],
          ),
          input.items.map((item) => [
            item.name,
            this.formatQuantity(item.currentStock),
            this.formatQuantity(item.minStock),
            item.unit,
            item.unitCost != null ? this.formatMoney(item.unitCost) : '—',
            this.stockStatus(item),
          ]),
        );
        doc.moveDown(0.6);
      }

      if (input.affectedDishes.length > 0) {
        this.addSection(doc, 'Platos impactados por quiebre');
        renderPdfTable(
          doc,
          pdfTableColumnsFromWeights(['Plato', 'Insumo'], [2, 2]),
          input.affectedDishes.map((row) => [
            row.dishName,
            row.inventoryItemName,
          ]),
        );
        doc.moveDown(0.6);
      }

      const itemsWithRecipes = input.items.filter(
        (item) => item.linkedDishNames.length > 0,
      );
      if (itemsWithRecipes.length > 0) {
        this.addSection(doc, 'Vínculos con platos');
        renderPdfTable(
          doc,
          pdfTableColumnsFromWeights(['Insumo', 'Platos vinculados'], [2, 3]),
          itemsWithRecipes.map((item) => [
            item.name,
            item.linkedDishNames.join(', '),
          ]),
        );
      }

      doc.end();
    });
  }

  private addSection(doc: PdfDoc, title: string) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(title);
    doc.moveDown(0.3);
  }

  private stockStatus(item: InventoryPdfItem): string {
    if (item.currentStock <= 0) return 'Quiebre';
    if (item.currentStock <= item.minStock) return 'Bajo';
    return 'OK';
  }

  private formatQuantity(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  private formatMoney(value: number): string {
    return `$${value.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }
}
