import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  pdfTableColumnsFromWeights,
  renderPdfTable,
  type PdfDoc,
} from '../common/utils/pdf-table.util';

interface HealthPdfInput {
  restaurantName: string;
  periodDays: number;
  dashboard: {
    healthScore: {
      overall: number;
      operational: number;
      commercial: number;
      margin: number;
    };
    commercial: {
      totalOrders: number;
      totalRevenue: number;
      onlineSharePercent: number;
      channelBreakdown: {
        salon: number;
        online: number;
        delivery: number;
      };
    };
    margin: {
      dishesWithCostCount: number;
      dishesWithoutCostCount: number;
      averageMarginPercent: number | null;
      topProfitable: Array<{
        name: string;
        marginPercent: number | null;
        grossMarginTotal: number | null;
        unitsSold: number;
      }>;
      lowMarginAlerts: Array<{
        name: string;
        marginPercent: number | null;
        unitsSold: number;
      }>;
    };
    inventory: {
      lowStockItems: Array<{
        name: string;
        currentStock: number;
        minStock: number;
        unit: string;
      }>;
    };
    growth: {
      actions: Array<{ title: string; detail: string }>;
      recommendations: Array<{ title: string; detail: string }>;
    };
    retention: {
      averageD7Rate: number | null;
      averageD30Rate: number | null;
    };
  };
}

@Injectable()
export class BusinessHealthPdfService {
  async generateReport(input: HealthPdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { dashboard: data } = input;

      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .fillColor('#111111')
        .text('Salud del negocio', { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          `${input.restaurantName} · últimos ${input.periodDays} días · ${new Date().toLocaleDateString('es-AR')}`,
          { align: 'center' },
        );
      doc.moveDown(1.2);

      this.addSection(doc, 'Scores de salud');
      renderPdfTable(
        doc,
        pdfTableColumnsFromWeights(['Área', 'Score'], [3, 1]),
        [
          ['General', String(data.healthScore.overall)],
          ['Operación', String(data.healthScore.operational)],
          ['Comercial', String(data.healthScore.commercial)],
          ['Margen', String(data.healthScore.margin)],
        ],
      );
      doc.moveDown(0.8);

      this.addSection(doc, 'Canal comercial');
      renderPdfTable(
        doc,
        pdfTableColumnsFromWeights(
          ['Canal', 'Ingresos', 'Participación'],
          [2, 2, 1.2],
        ),
        [
          [
            'Salón',
            this.formatMoney(data.commercial.channelBreakdown.salon),
            this.share(
              data.commercial.channelBreakdown.salon,
              data.commercial.totalRevenue,
            ),
          ],
          [
            'Online / QR',
            this.formatMoney(data.commercial.channelBreakdown.online),
            `${data.commercial.onlineSharePercent}%`,
          ],
          [
            'Delivery',
            this.formatMoney(data.commercial.channelBreakdown.delivery),
            this.share(
              data.commercial.channelBreakdown.delivery,
              data.commercial.totalRevenue,
            ),
          ],
        ],
      );
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          `${data.commercial.totalOrders} pedidos · ${this.formatMoney(data.commercial.totalRevenue)} total`,
        );
      doc.moveDown(0.8);

      this.addSection(doc, 'Margen por plato');
      doc
        .fontSize(9)
        .fillColor('#666666')
        .text(
          `${data.margin.dishesWithCostCount} con costo · ${data.margin.dishesWithoutCostCount} sin costo` +
            (data.margin.averageMarginPercent != null
              ? ` · margen promedio ${this.formatPercent(data.margin.averageMarginPercent)}`
              : ''),
        );
      doc.moveDown(0.4);

      if (data.margin.topProfitable.length > 0) {
        renderPdfTable(
          doc,
          pdfTableColumnsFromWeights(
            ['Plato', 'Margen %', 'Unidades', 'Margen $'],
            [4, 1.5, 1.5, 2],
          ),
          data.margin.topProfitable.map((row) => [
            row.name,
            row.marginPercent != null
              ? `${this.formatPercent(row.marginPercent)}`
              : '—',
            String(row.unitsSold),
            row.grossMarginTotal != null
              ? this.formatMoney(row.grossMarginTotal)
              : '—',
          ]),
        );
        doc.moveDown(0.6);
      }

      if (data.margin.lowMarginAlerts.length > 0) {
        this.addSection(doc, 'Alertas de margen bajo');
        renderPdfTable(
          doc,
          pdfTableColumnsFromWeights(
            ['Plato', 'Margen %', 'Ventas'],
            [4, 1.5, 1.5],
          ),
          data.margin.lowMarginAlerts.map((row) => [
            row.name,
            row.marginPercent != null
              ? `${this.formatPercent(row.marginPercent)}`
              : '—',
            String(row.unitsSold),
          ]),
        );
        doc.moveDown(0.6);
      }

      if (data.inventory.lowStockItems.length > 0) {
        this.addSection(doc, 'Inventario en quiebre');
        renderPdfTable(
          doc,
          pdfTableColumnsFromWeights(
            ['Insumo', 'Stock', 'Mínimo'],
            [3, 1.5, 1.5],
          ),
          data.inventory.lowStockItems.map((item) => [
            item.name,
            `${item.currentStock} ${item.unit}`,
            `${item.minStock} ${item.unit}`,
          ]),
        );
        doc.moveDown(0.6);
      }

      this.addSection(doc, 'Retención');
      renderPdfTable(
        doc,
        pdfTableColumnsFromWeights(['Métrica', 'Valor'], [3, 1]),
        [
          [
            'D7 (vuelven a la semana)',
            data.retention.averageD7Rate != null
              ? `${data.retention.averageD7Rate}%`
              : '—',
          ],
          [
            'D30 (vuelven al mes)',
            data.retention.averageD30Rate != null
              ? `${data.retention.averageD30Rate}%`
              : '—',
          ],
        ],
      );
      doc.moveDown(0.8);

      if (data.growth.actions.length > 0) {
        this.addSection(doc, 'Acciones sugeridas');
        for (const action of data.growth.actions.slice(0, 5)) {
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#222222')
            .text(action.title);
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#555555')
            .text(action.detail)
            .moveDown(0.4);
        }
      }

      doc.end();
    });
  }

  private addSection(doc: PdfDoc, title: string) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(title);
    doc.moveDown(0.3);
  }

  private formatMoney(value: number): string {
    return `$${value.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  private formatPercent(value: number): string {
    return `${Math.round(value * 10) / 10}%`;
  }

  private share(part: number, total: number): string {
    if (total <= 0) return '0%';
    return `${Math.round((part / total) * 1000) / 10}%`;
  }
}
