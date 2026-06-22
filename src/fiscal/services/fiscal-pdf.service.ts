import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { FiscalDocumentType } from '@prisma/client';
import { buildAfipQrUrl } from '../utils/afip-qr.util';

export interface FiscalPdfLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

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
  customerIvaCondition?: number | null;
  subtotal: number;
  ivaAmount: number;
  total: number;
  createdAt: Date;
  restaurantName: string;
  restaurantTaxId?: string | null;
  issuerRazonSocial?: string | null;
  issuerPuntoVenta?: number | null;
  relatedInvoiceType?: FiscalDocumentType | null;
  lineItems?: FiscalPdfLineItem[];
}

@Injectable()
export class FiscalPdfService {
  async generate(
    input: FiscalPdfInput,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const qrBuffer = await this.buildQrImage(input);
    const docNumber = this.formatDocumentNumber(input.puntoVenta, input.numero);

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderHeader(doc, input, docNumber);

      if (qrBuffer) {
        doc.image(qrBuffer, doc.page.width - 48 - 96, 48, {
          width: 96,
          height: 96,
        });
      }

      doc.moveDown(1.2);
      this.renderPartyBlock(doc, 'Emisor', [
        input.issuerRazonSocial?.trim() || input.restaurantName,
        input.restaurantTaxId ? `CUIT: ${input.restaurantTaxId}` : null,
        input.issuerPuntoVenta != null
          ? `Punto de venta: ${String(input.issuerPuntoVenta).padStart(4, '0')}`
          : null,
      ]);

      this.renderPartyBlock(doc, 'Cliente', [
        input.customerName?.trim() || 'Consumidor final',
        input.customerDocNumber
          ? `${input.customerDocType ?? 'Doc.'}: ${input.customerDocNumber}`
          : null,
      ]);

      this.renderLineItems(doc, input.lineItems ?? []);
      this.renderTotals(doc, input);
      this.renderAuthorization(doc, input, qrBuffer != null);
      this.renderFooter(doc);

      doc.end();
    });

    const filename = this.buildFilename(input.type, docNumber);
    return { buffer, filename };
  }

  private async buildQrImage(input: FiscalPdfInput): Promise<Buffer | null> {
    if (
      input.type === FiscalDocumentType.INTERNAL_TICKET ||
      input.status !== 'AUTHORIZED' ||
      !input.cae ||
      input.puntoVenta == null ||
      input.numero == null ||
      !input.restaurantTaxId
    ) {
      return null;
    }

    const url = buildAfipQrUrl({
      createdAt: input.createdAt,
      cuit: input.restaurantTaxId,
      puntoVenta: input.puntoVenta,
      numero: input.numero,
      type: input.type,
      total: input.total,
      cae: input.cae,
      customerDocType: input.customerDocType,
      customerDocNumber: input.customerDocNumber,
      relatedInvoiceType: input.relatedInvoiceType,
    });

    return QRCode.toBuffer(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
    });
  }

  private renderHeader(
    doc: InstanceType<typeof PDFDocument>,
    input: FiscalPdfInput,
    docNumber: string,
  ) {
    const typeLabel = this.getTypeLabel(input.type);
    const letter = this.getTypeLetter(input.type);

    if (letter) {
      doc.rect(doc.page.width / 2 - 24, 48, 48, 48).stroke('#111827');
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(letter, doc.page.width / 2 - 24, 58, {
          width: 48,
          align: 'center',
        });
    }

    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(typeLabel, 48, 48, {
        width: doc.page.width - 48 - 48 - 120,
        align: 'center',
      });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#444444')
      .text(`Comprobante Nº ${docNumber}`, {
        align: 'center',
      });

    doc.fontSize(9).text(`Fecha: ${input.createdAt.toLocaleString('es-AR')}`, {
      align: 'center',
    });
  }

  private renderPartyBlock(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    lines: Array<string | null | undefined>,
  ) {
    doc.moveDown(0.6);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(title);
    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    for (const line of lines) {
      if (line) doc.text(line);
    }
  }

  private renderLineItems(
    doc: InstanceType<typeof PDFDocument>,
    lineItems: FiscalPdfLineItem[],
  ) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).text('Detalle');

    if (lineItems.length === 0) {
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).text('Venta de salón');
      return;
    }

    doc.moveDown(0.4);
    const startX = doc.x;
    const tableWidth = doc.page.width - 96;
    const qtyWidth = 48;
    const unitWidth = 72;
    const subtotalWidth = 80;
    const descWidth = tableWidth - qtyWidth - unitWidth - subtotalWidth;

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Descripción', startX, doc.y, { width: descWidth });
    doc.text('Cant.', startX + descWidth, doc.y - doc.currentLineHeight(), {
      width: qtyWidth,
      align: 'right',
    });
    doc.text(
      'P. unit.',
      startX + descWidth + qtyWidth,
      doc.y - doc.currentLineHeight(),
      {
        width: unitWidth,
        align: 'right',
      },
    );
    doc.text(
      'Subtotal',
      startX + descWidth + qtyWidth + unitWidth,
      doc.y - doc.currentLineHeight(),
      { width: subtotalWidth, align: 'right' },
    );

    doc.moveDown(0.2);
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + tableWidth, doc.y)
      .stroke('#d1d5db');

    doc.font('Helvetica').fontSize(9);
    for (const item of lineItems) {
      doc.moveDown(0.25);
      const rowY = doc.y;
      doc.text(item.description, startX, rowY, { width: descWidth });
      doc.text(String(item.quantity), startX + descWidth, rowY, {
        width: qtyWidth,
        align: 'right',
      });
      doc.text(
        this.formatMoney(item.unitPrice),
        startX + descWidth + qtyWidth,
        rowY,
        {
          width: unitWidth,
          align: 'right',
        },
      );
      doc.text(
        this.formatMoney(item.subtotal),
        startX + descWidth + qtyWidth + unitWidth,
        rowY,
        { width: subtotalWidth, align: 'right' },
      );
      doc.y = rowY + doc.currentLineHeight() + 2;
    }
  }

  private renderTotals(
    doc: InstanceType<typeof PDFDocument>,
    input: FiscalPdfInput,
  ) {
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(10);
    this.addRow(doc, 'Subtotal', this.formatMoney(input.subtotal));
    if (input.ivaAmount > 0) {
      this.addRow(doc, 'IVA', this.formatMoney(input.ivaAmount));
    }
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold');
    this.addRow(doc, 'Total', this.formatMoney(input.total));
    doc.font('Helvetica');
  }

  private renderAuthorization(
    doc: InstanceType<typeof PDFDocument>,
    input: FiscalPdfInput,
    hasQr: boolean,
  ) {
    doc.moveDown(1);

    if (input.cae) {
      doc.font('Helvetica-Bold').fontSize(11).text('Autorización ARCA');
      doc.font('Helvetica').fontSize(10);
      doc.text(`CAE: ${input.cae}`);
      if (input.caeExpiresAt) {
        doc.text(
          `Vencimiento CAE: ${input.caeExpiresAt.toLocaleDateString('es-AR')}`,
        );
      }
      if (hasQr) {
        doc.moveDown(0.3);
        doc
          .fontSize(9)
          .fillColor('#444444')
          .text(
            'Comprobante autorizado — escaneá el QR para verificar en AFIP.',
          );
      }
      doc.fillColor('#111827');
      return;
    }

    if (input.type === FiscalDocumentType.INTERNAL_TICKET) {
      doc.fontSize(10).text('Ticket interno — no válido como factura fiscal.');
      return;
    }

    doc.fillColor('#b45309').fontSize(10).text(`Estado: ${input.status}`);
    doc.fillColor('#111827');
  }

  private renderFooter(doc: InstanceType<typeof PDFDocument>) {
    doc.moveDown(1.5);
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text(`Generado: ${new Date().toLocaleString('es-AR')} · Bentoo`, {
        align: 'center',
      });
  }

  private addRow(
    doc: InstanceType<typeof PDFDocument>,
    label: string,
    value: string,
  ) {
    doc.font('Helvetica').fillColor('#111827').text(`${label}: ${value}`);
  }

  private formatMoney(amount: number): string {
    return `$${amount.toLocaleString('es-AR')}`;
  }

  private formatDocumentNumber(
    puntoVenta?: number | null,
    numero?: number | null,
  ): string {
    if (puntoVenta == null || numero == null) return '—';
    return `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`;
  }

  private buildFilename(type: FiscalDocumentType, docNumber: string): string {
    const safeNumber = docNumber.replace(/[^\d-]/g, '').replace('-', '_');
    return `comprobante-${type.toLowerCase()}-${safeNumber || Date.now()}.pdf`;
  }

  private getTypeLabel(type: FiscalDocumentType): string {
    switch (type) {
      case FiscalDocumentType.FACTURA_A:
        return 'Factura A';
      case FiscalDocumentType.FACTURA_B:
        return 'Factura B';
      case FiscalDocumentType.FACTURA_C:
        return 'Factura C';
      case FiscalDocumentType.NOTA_CREDITO:
        return 'Nota de crédito';
      default:
        return 'Ticket interno';
    }
  }

  private getTypeLetter(type: FiscalDocumentType): string | null {
    switch (type) {
      case FiscalDocumentType.FACTURA_A:
        return 'A';
      case FiscalDocumentType.FACTURA_B:
        return 'B';
      case FiscalDocumentType.FACTURA_C:
        return 'C';
      default:
        return null;
    }
  }
}
