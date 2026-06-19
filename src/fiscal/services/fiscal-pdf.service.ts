import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { FiscalDocumentType } from '@prisma/client';

export interface FiscalPdfInput {
  type: FiscalDocumentType;
  status: string;
  puntoVenta?: number | null;
  numero?: number | null;
  cae?: string | null;
  caeExpiresAt?: Date | null;
  customerName?: string | null;
  customerDocType?: string | null;
  customerDocNumber?: string | null;
  subtotal: number;
  ivaAmount: number;
  total: number;
  createdAt: Date;
  restaurantName: string;
  restaurantTaxId?: string | null;
}

@Injectable()
export class FiscalPdfService {
  async generate(
    input: FiscalPdfInput,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const typeLabel = this.getTypeLabel(input.type);
      const docNumber =
        input.puntoVenta != null && input.numero != null
          ? `${String(input.puntoVenta).padStart(4, '0')}-${String(input.numero).padStart(8, '0')}`
          : '—';

      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(typeLabel, { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#444')
        .text(`Comprobante Nº ${docNumber}`, { align: 'center' });
      doc.moveDown(1.2);

      doc.fillColor('#000').fontSize(11).font('Helvetica-Bold').text('Emisor');
      doc.font('Helvetica').text(input.restaurantName);
      if (input.restaurantTaxId) {
        doc.text(`CUIT: ${input.restaurantTaxId}`);
      }
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('Cliente');
      doc
        .font('Helvetica')
        .text(input.customerName?.trim() || 'Consumidor final');
      if (input.customerDocNumber) {
        doc.text(
          `${input.customerDocType ?? 'Doc.'}: ${input.customerDocNumber}`,
        );
      }
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').text('Detalle');
      doc.moveDown(0.3);
      this.addRow(doc, 'Subtotal', this.formatMoney(input.subtotal));
      this.addRow(doc, 'IVA', this.formatMoney(input.ivaAmount));
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold');
      this.addRow(doc, 'Total', this.formatMoney(input.total));
      doc.font('Helvetica');
      doc.moveDown(1);

      if (input.cae) {
        doc.font('Helvetica-Bold').text('Autorización ARCA');
        doc.font('Helvetica').text(`CAE: ${input.cae}`);
        if (input.caeExpiresAt) {
          doc.text(
            `Vencimiento CAE: ${input.caeExpiresAt.toLocaleDateString('es-AR')}`,
          );
        }
      } else if (input.type === 'INTERNAL_TICKET') {
        doc.text('Ticket interno — no válido como factura fiscal.');
      } else {
        doc.fillColor('#b45309').text(`Estado: ${input.status}`);
      }

      doc.moveDown(1.5);
      doc
        .fontSize(9)
        .fillColor('#666')
        .text(`Generado: ${new Date().toLocaleString('es-AR')} · Bentoo`, {
          align: 'center',
        });

      doc.end();
    });

    const filename = `comprobante-${input.type.toLowerCase()}-${Date.now()}.pdf`;
    return { buffer, filename };
  }

  private addRow(
    doc: InstanceType<typeof PDFDocument>,
    label: string,
    value: string,
  ) {
    doc.font('Helvetica').fillColor('#000').text(`${label}: ${value}`);
  }

  private formatMoney(amount: number): string {
    return `$${amount.toLocaleString('es-AR')}`;
  }

  private getTypeLabel(type: FiscalDocumentType): string {
    switch (type) {
      case 'FACTURA_A':
        return 'Factura A';
      case 'FACTURA_B':
        return 'Factura B';
      case 'FACTURA_C':
        return 'Factura C';
      case 'NOTA_CREDITO':
        return 'Nota de crédito';
      default:
        return 'Ticket interno';
    }
  }
}
