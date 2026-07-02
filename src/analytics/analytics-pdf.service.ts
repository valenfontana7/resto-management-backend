import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  pdfTableColumnsFromWeights,
  renderPdfTable,
  type PdfDoc,
} from '../common/utils/pdf-table.util';

interface ReportData {
  period: string;
  sales: any;
  topDishes: any;
  categories: any;
  performance: any;
}

@Injectable()
export class AnalyticsPdfService {
  async generateReport(data: ReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('Reporte de Analytics', { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#666')
        .text(
          `Período: ${data.period} — Generado: ${new Date().toLocaleDateString('es-AR')}`,
          {
            align: 'center',
          },
        );
      doc.moveDown(1.5);

      // Performance metrics
      this.addSection(doc, 'Métricas de Rendimiento');
      if (data.performance) {
        const perf = data.performance;
        const metrics = [
          [
            'Ingresos totales',
            this.formatCurrency(perf.totalRevenue ?? perf.revenue ?? 0),
          ],
          ['Pedidos totales', String(perf.totalOrders ?? perf.orders ?? 0)],
          [
            'Ticket promedio',
            this.formatCurrency(perf.averageOrderValue ?? perf.avgTicket ?? 0),
          ],
        ];
        this.addTable(doc, ['Métrica', 'Valor'], metrics);
      }
      doc.moveDown(1);

      // Sales summary
      if (data.sales?.data?.length) {
        this.addSection(doc, 'Ventas por Período');
        const salesRows = data.sales.data
          .slice(0, 15)
          .map((s: any) => [
            s.label || s.date || s.period || '-',
            this.formatCurrency(s.revenue ?? s.total ?? 0),
            String(s.orders ?? s.count ?? 0),
          ]);
        this.addTable(doc, ['Fecha', 'Ingresos', 'Pedidos'], salesRows);
        doc.moveDown(1);
      }

      // Top dishes
      if (Array.isArray(data.topDishes) && data.topDishes.length) {
        this.addSection(doc, 'Platos Más Vendidos');
        const dishRows = data.topDishes
          .slice(0, 10)
          .map((d: any, i: number) => [
            `${i + 1}. ${d.dishName || d.name || '-'}`,
            String(d.quantity ?? d.count ?? 0),
            this.formatCurrency(d.revenue ?? 0),
          ]);
        this.addTable(doc, ['Plato', 'Vendidos', 'Ingresos'], dishRows);
        doc.moveDown(1);
      }

      // Category breakdown
      if (Array.isArray(data.categories) && data.categories.length) {
        this.addSection(doc, 'Desglose por Categoría');
        const catRows = data.categories
          .slice(0, 10)
          .map((c: any) => [
            c.categoryName || c.name || '-',
            String(c.orders ?? c.count ?? 0),
            this.formatCurrency(c.revenue ?? 0),
            `${(c.percentage ?? 0).toFixed(1)}%`,
          ]);
        this.addTable(doc, ['Categoría', 'Pedidos', 'Ingresos', '%'], catRows);
      }

      doc.end();
    });
  }

  private addSection(doc: PdfDoc, title: string) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a1a').text(title);
    doc.moveDown(0.5);
    doc
      .moveTo(doc.x, doc.y)
      .lineTo(doc.x + 495, doc.y)
      .strokeColor('#e0e0e0')
      .stroke();
    doc.moveDown(0.5);
  }

  private addTable(doc: PdfDoc, headers: string[], rows: string[][]) {
    const weights =
      headers.length === 2
        ? [2, 1]
        : headers.length === 3
          ? [2.5, 1.5, 1.5]
          : headers.length === 4
            ? [3, 1.2, 1.2, 1.2]
            : headers.map(() => 1);

    renderPdfTable(doc, pdfTableColumnsFromWeights(headers, weights), rows);
  }

  private formatCurrency(value: number): string {
    return `$${(value / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  }
}
