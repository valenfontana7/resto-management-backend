import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AfipAuthorizationService } from '../../fiscal/services/afip-authorization.service';
import { AfipPadronService } from '../../fiscal/services/afip-padron.service';
import { FiscalConfigService } from '../../fiscal/services/fiscal-config.service';
import { FiscalPdfService } from '../../fiscal/services/fiscal-pdf.service';
import { S3Service } from '../../storage/s3.service';
import { buildAfipAmounts } from '../../fiscal/utils/afip-amount.util';
import { validateFiscalCustomerInput } from '../../fiscal/utils/afip-fiscal-validation.util';

export interface CreateFiscalDocumentInput {
  type: FiscalDocumentType;
  subtotal: number;
  total: number;
  customerDocType?: string;
  customerDocNumber?: string;
  customerName?: string;
  customerIvaCondition?: number;
}

/**
 * Capa de comprobantes fiscales.
 * Emite tickets internos y solicita CAE vía AFIP WSFEv1 cuando está configurado.
 */
@Injectable()
export class FiscalDocumentService {
  private readonly logger = new Logger(FiscalDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly afipAuthorization: AfipAuthorizationService,
    private readonly afipPadron: AfipPadronService,
    private readonly fiscalConfig: FiscalConfigService,
    private readonly fiscalPdf: FiscalPdfService,
    private readonly s3: S3Service,
  ) {}

  async createForOrder(
    restaurantId: string,
    orderId: string,
    input: CreateFiscalDocumentInput,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { id: true, total: true, paymentStatus: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }

    if (order.paymentStatus !== 'PAID') {
      throw new BadRequestException(
        'Solo se puede facturar un pedido con pago confirmado',
      );
    }

    const existing = await this.prisma.fiscalDocument.findFirst({
      where: {
        restaurantId,
        orderId,
        type: input.type,
        status: {
          in: [
            FiscalDocumentStatus.AUTHORIZED,
            FiscalDocumentStatus.PENDING_AFIP,
          ],
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Este pedido ya tiene un comprobante fiscal activo',
      );
    }

    this.assertValidFiscalInput({
      ...input,
      total: order.total,
    });

    const resolvedInput: CreateFiscalDocumentInput = {
      ...input,
      total: order.total,
      subtotal: order.total,
    };

    if (resolvedInput.type === FiscalDocumentType.INTERNAL_TICKET) {
      return this.createInternalTicket(
        restaurantId,
        null,
        orderId,
        resolvedInput,
      );
    }

    return this.createFiscalDocument(
      restaurantId,
      null,
      orderId,
      resolvedInput,
    );
  }

  async createForSession(
    restaurantId: string,
    tableSessionId: string,
    orderId: string,
    input: CreateFiscalDocumentInput,
  ) {
    this.assertValidFiscalInput(input);

    if (input.type === FiscalDocumentType.INTERNAL_TICKET) {
      return this.createInternalTicket(
        restaurantId,
        tableSessionId,
        orderId,
        input,
      );
    }

    return this.createFiscalDocument(
      restaurantId,
      tableSessionId,
      orderId,
      input,
    );
  }

  async listDocuments(
    restaurantId: string,
    options?: { limit?: number; status?: FiscalDocumentStatus },
  ) {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

    const docs = await this.prisma.fiscalDocument.findMany({
      where: {
        restaurantId,
        ...(options?.status ? { status: options.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return docs.map((doc) => this.format(doc));
  }

  async getById(restaurantId: string, documentId: string) {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id: documentId, restaurantId },
    });
    return doc ? this.format(doc) : null;
  }

  async lookupPadron(restaurantId: string, cuit: string) {
    return this.afipPadron.lookupCuit(restaurantId, cuit);
  }

  async createCreditNote(restaurantId: string, documentId: string) {
    const original = await this.prisma.fiscalDocument.findFirst({
      where: { id: documentId, restaurantId },
    });

    if (!original) {
      throw new NotFoundException('Comprobante no encontrado');
    }

    if (original.status !== FiscalDocumentStatus.AUTHORIZED) {
      throw new BadRequestException(
        'Solo se puede anular un comprobante autorizado',
      );
    }

    if (original.type === FiscalDocumentType.INTERNAL_TICKET) {
      throw new BadRequestException(
        'Los tickets internos no generan nota de crédito fiscal',
      );
    }

    if (original.type === FiscalDocumentType.NOTA_CREDITO) {
      throw new BadRequestException(
        'No se puede emitir nota de crédito sobre otra nota de crédito',
      );
    }

    const existingCredit = await this.prisma.fiscalDocument.findFirst({
      where: {
        restaurantId,
        relatedFiscalDocumentId: original.id,
        type: FiscalDocumentType.NOTA_CREDITO,
        status: {
          in: [
            FiscalDocumentStatus.AUTHORIZED,
            FiscalDocumentStatus.PENDING_AFIP,
          ],
        },
      },
    });

    if (existingCredit) {
      throw new BadRequestException(
        'Ya existe una nota de crédito para este comprobante',
      );
    }

    const amounts = buildAfipAmounts(
      original.type,
      original.total,
      null,
      await this.resolveIvaRate(restaurantId),
    );

    const doc = await this.prisma.fiscalDocument.create({
      data: {
        restaurantId,
        tableSessionId: original.tableSessionId,
        orderId: original.orderId,
        type: FiscalDocumentType.NOTA_CREDITO,
        status: FiscalDocumentStatus.PENDING_AFIP,
        subtotal: amounts.impNeto,
        total: original.total,
        ivaAmount: Math.round(original.total - amounts.impNeto),
        customerDocType: original.customerDocType,
        customerDocNumber: original.customerDocNumber,
        customerName: original.customerName,
        customerIvaCondition: original.customerIvaCondition,
        relatedFiscalDocumentId: original.id,
        payload: {
          integration: 'wsfev1',
          note: 'Nota de crédito — solicitando autorización ARCA',
          relatedInvoiceType: original.type,
        },
      },
    });

    const authorized = await this.requestAfipAuthorization(
      restaurantId,
      doc.id,
      {
        type: FiscalDocumentType.NOTA_CREDITO,
        subtotal: amounts.impNeto,
        total: original.total,
        customerDocType: original.customerDocType ?? undefined,
        customerDocNumber: original.customerDocNumber ?? undefined,
        customerName: original.customerName ?? undefined,
        customerIvaCondition: original.customerIvaCondition ?? undefined,
      },
      {
        relatedInvoiceType: original.type,
        relatedVoucher:
          original.puntoVenta != null && original.numero != null
            ? this.afipAuthorization.buildRelatedVoucher(
                original.type,
                original.puntoVenta,
                original.numero,
              )
            : undefined,
      },
    );

    return authorized ? this.format(authorized) : this.format(doc);
  }

  async retryAuthorization(restaurantId: string, documentId: string) {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id: documentId, restaurantId },
      include: {
        relatedFiscalDocument: true,
      },
    });

    if (!doc) {
      throw new NotFoundException('Comprobante no encontrado');
    }

    if (
      doc.type === FiscalDocumentType.INTERNAL_TICKET ||
      doc.status === FiscalDocumentStatus.AUTHORIZED
    ) {
      return this.format(doc);
    }

    const relatedInvoiceType =
      doc.type === FiscalDocumentType.NOTA_CREDITO
        ? (doc.relatedFiscalDocument?.type ??
          this.extractRelatedInvoiceType(doc.payload))
        : undefined;

    const updated = await this.requestAfipAuthorization(
      restaurantId,
      doc.id,
      {
        type: doc.type,
        subtotal: doc.subtotal,
        total: doc.total,
        customerDocType: doc.customerDocType ?? undefined,
        customerDocNumber: doc.customerDocNumber ?? undefined,
        customerName: doc.customerName ?? undefined,
        customerIvaCondition: doc.customerIvaCondition ?? undefined,
      },
      {
        relatedInvoiceType,
        relatedVoucher:
          doc.type === FiscalDocumentType.NOTA_CREDITO &&
          doc.relatedFiscalDocument?.puntoVenta != null &&
          doc.relatedFiscalDocument.numero != null
            ? this.afipAuthorization.buildRelatedVoucher(
                doc.relatedFiscalDocument.type,
                doc.relatedFiscalDocument.puntoVenta,
                doc.relatedFiscalDocument.numero,
              )
            : undefined,
      },
    );

    return updated ? this.format(updated) : null;
  }

  async testAfipConnection(restaurantId: string) {
    const result = await this.afipAuthorization.testConnection(restaurantId);
    if (result.ok) {
      await this.fiscalConfig.recordConnectionSuccess(restaurantId);
    }
    return result;
  }

  async generatePdf(restaurantId: string, documentId: string) {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id: documentId, restaurantId },
      include: {
        relatedFiscalDocument: {
          select: { type: true },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException('Comprobante no encontrado');
    }

    if (
      doc.type !== FiscalDocumentType.INTERNAL_TICKET &&
      doc.status !== FiscalDocumentStatus.AUTHORIZED
    ) {
      throw new BadRequestException(
        'Solo se puede descargar PDF de comprobantes autorizados o tickets internos',
      );
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, taxId: true, businessRules: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const fiscalConfig = await this.fiscalConfig.getPublicConfig(restaurantId);
    const lineItems = await this.loadLineItems(doc.orderId);

    return this.fiscalPdf.generate({
      type: doc.type,
      status: doc.status,
      puntoVenta: doc.puntoVenta,
      numero: doc.numero,
      cae: doc.cae,
      caeExpiresAt: doc.caeExpiresAt,
      customerName: doc.customerName,
      customerDocType: doc.customerDocType,
      customerDocNumber: doc.customerDocNumber,
      customerIvaCondition: doc.customerIvaCondition,
      subtotal: doc.subtotal,
      ivaAmount: doc.ivaAmount,
      total: doc.total,
      createdAt: doc.createdAt,
      restaurantName: restaurant.name,
      restaurantTaxId: fiscalConfig?.cuit ?? restaurant.taxId,
      issuerRazonSocial: fiscalConfig?.razonSocial,
      issuerPuntoVenta: fiscalConfig?.puntoVenta ?? doc.puntoVenta,
      relatedInvoiceType: doc.relatedFiscalDocument?.type ?? null,
      lineItems,
    });
  }

  private async loadLineItems(orderId?: string | null) {
    if (!orderId) return [];

    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      include: {
        dish: { select: { name: true } },
        selectedModifiers: { select: { name: true, priceAdj: true } },
      },
      orderBy: { id: 'asc' },
    });

    return items.map((item) => {
      const modifierLabel = item.selectedModifiers
        .map((modifier) => modifier.name)
        .filter(Boolean)
        .join(', ');
      const description = modifierLabel
        ? `${item.dish.name} (${modifierLabel})`
        : item.dish.name;

      return {
        description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      };
    });
  }

  async saveAfipCertificate(
    restaurantId: string,
    certificatePem: string,
    privateKeyPem: string,
  ) {
    return this.fiscalConfig.saveCertificate(
      restaurantId,
      certificatePem,
      privateKeyPem,
    );
  }

  async clearAfipCertificate(restaurantId: string) {
    return this.fiscalConfig.clearCertificate(restaurantId);
  }

  private assertValidFiscalInput(input: CreateFiscalDocumentInput) {
    const errors = validateFiscalCustomerInput(input);
    if (errors.length > 0) {
      throw new BadRequestException(errors.join('. '));
    }
  }

  private async createInternalTicket(
    restaurantId: string,
    tableSessionId: string | null,
    orderId: string,
    input: CreateFiscalDocumentInput,
  ) {
    const doc = await this.prisma.fiscalDocument.create({
      data: {
        restaurantId,
        tableSessionId,
        orderId,
        type: FiscalDocumentType.INTERNAL_TICKET,
        status: FiscalDocumentStatus.AUTHORIZED,
        subtotal: input.subtotal,
        total: input.total,
        ivaAmount: 0,
        customerName: input.customerName ?? null,
        payload: {
          kind: 'internal_ticket',
          printable: true,
          message: 'Comprobante interno — no válido como factura fiscal',
        },
      },
    });
    return this.format(doc);
  }

  private async createFiscalDocument(
    restaurantId: string,
    tableSessionId: string | null,
    orderId: string,
    input: CreateFiscalDocumentInput,
  ) {
    const amounts = buildAfipAmounts(
      input.type,
      input.total,
      null,
      await this.resolveIvaRate(restaurantId),
    );

    const doc = await this.prisma.fiscalDocument.create({
      data: {
        restaurantId,
        tableSessionId,
        orderId,
        type: input.type,
        status: FiscalDocumentStatus.PENDING_AFIP,
        subtotal: amounts.impNeto,
        total: input.total,
        ivaAmount: Math.round(input.total - amounts.impNeto),
        customerDocType: input.customerDocType ?? null,
        customerDocNumber: input.customerDocNumber ?? null,
        customerName: input.customerName ?? null,
        customerIvaCondition: input.customerIvaCondition ?? null,
        payload: {
          integration: 'wsfev1',
          note: 'Solicitando autorización ARCA',
        },
      },
    });

    const authorized = await this.requestAfipAuthorization(
      restaurantId,
      doc.id,
      input,
    );

    return authorized ? this.format(authorized) : this.format(doc);
  }

  private async requestAfipAuthorization(
    restaurantId: string,
    documentId: string,
    input: CreateFiscalDocumentInput,
    options?: {
      relatedInvoiceType?: FiscalDocumentType;
      relatedVoucher?: ReturnType<
        AfipAuthorizationService['buildRelatedVoucher']
      >;
    },
  ) {
    const result = await this.afipAuthorization.authorize({
      restaurantId,
      type: input.type,
      totalPesos: input.total,
      customerDocType: input.customerDocType,
      customerDocNumber: input.customerDocNumber,
      customerIvaCondition: input.customerIvaCondition,
      relatedInvoiceType: options?.relatedInvoiceType,
      relatedVoucher: options?.relatedVoucher,
    });

    if (result.skipped) {
      this.logger.warn(
        `AFIP skipped for ${input.type} · restaurant=${restaurantId} reason=${result.reason}`,
      );
      return this.prisma.fiscalDocument.update({
        where: { id: documentId },
        data: {
          status: FiscalDocumentStatus.PENDING_AFIP,
          payload: {
            integration: 'wsfev1',
            skipped: true,
            reason: result.reason,
            errors: result.errors,
          },
        },
      });
    }

    if (result.success) {
      const authorized = await this.prisma.fiscalDocument.update({
        where: { id: documentId },
        data: {
          status: FiscalDocumentStatus.AUTHORIZED,
          cae: result.cae ?? null,
          caeExpiresAt: result.caeExpiresAt ?? null,
          numero: result.numero ?? null,
          puntoVenta: result.puntoVenta,
          payload: {
            integration: 'wsfev1',
            authorized: true,
            observations: result.observations,
          },
        },
      });
      void this.persistAuthorizedPdf(restaurantId, documentId);
      return authorized;
    }

    this.logger.warn(
      `AFIP rejected ${input.type} · restaurant=${restaurantId}: ${result.errors.join('; ')}`,
    );

    return this.prisma.fiscalDocument.update({
      where: { id: documentId },
      data: {
        status: FiscalDocumentStatus.REJECTED,
        puntoVenta: result.puntoVenta || null,
        payload: {
          integration: 'wsfev1',
          authorized: false,
          errors: result.errors,
          observations: result.observations,
        },
      },
    });
  }

  private async resolveIvaRate(restaurantId: string): Promise<number> {
    const config = await this.fiscalConfig.getPublicConfig(restaurantId);
    return config?.ivaRate ?? 21;
  }

  private async persistAuthorizedPdf(restaurantId: string, documentId: string) {
    try {
      const generated = await this.generatePdf(restaurantId, documentId);
      const key = `fiscal/${restaurantId}/${documentId}.pdf`;
      const uploaded = await this.s3.uploadObject({
        key,
        body: generated.buffer,
        contentType: 'application/pdf',
      });
      await this.prisma.fiscalDocument.update({
        where: { id: documentId },
        data: { pdfUrl: uploaded.url },
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo persistir PDF fiscal · doc=${documentId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private canDownloadPdf(doc: { type: string; status: string }): boolean {
    if (doc.status !== FiscalDocumentStatus.AUTHORIZED) return false;
    return true;
  }

  private extractRelatedInvoiceType(
    payload: unknown,
  ): FiscalDocumentType | undefined {
    if (!payload || typeof payload !== 'object') return undefined;
    const value = (payload as Record<string, unknown>).relatedInvoiceType;
    if (typeof value !== 'string') return undefined;
    return value as FiscalDocumentType;
  }

  private format(doc: {
    id: string;
    type: string;
    status: string;
    subtotal: number;
    ivaAmount: number;
    total: number;
    cae: string | null;
    caeExpiresAt: Date | null;
    numero: number | null;
    puntoVenta: number | null;
    customerDocType?: string | null;
    customerDocNumber?: string | null;
    customerName?: string | null;
    customerIvaCondition?: number | null;
    relatedFiscalDocumentId?: string | null;
    pdfUrl: string | null;
    payload: unknown;
    createdAt: Date;
    tableSessionId?: string | null;
    orderId?: string | null;
  }) {
    return {
      id: doc.id,
      type: doc.type,
      status: doc.status,
      subtotal: doc.subtotal,
      ivaAmount: doc.ivaAmount,
      total: doc.total,
      cae: doc.cae,
      caeExpiresAt: doc.caeExpiresAt,
      numero: doc.numero,
      puntoVenta: doc.puntoVenta,
      customerDocType: doc.customerDocType ?? null,
      customerDocNumber: doc.customerDocNumber ?? null,
      customerName: doc.customerName ?? null,
      customerIvaCondition: doc.customerIvaCondition ?? null,
      relatedFiscalDocumentId: doc.relatedFiscalDocumentId ?? null,
      pdfUrl: doc.pdfUrl,
      payload: doc.payload,
      createdAt: doc.createdAt,
      tableSessionId: doc.tableSessionId ?? null,
      orderId: doc.orderId ?? null,
      isFiscal: doc.type !== FiscalDocumentType.INTERNAL_TICKET,
      canDownloadPdf: this.canDownloadPdf(doc),
      canIssueCreditNote:
        doc.type !== FiscalDocumentType.INTERNAL_TICKET &&
        doc.type !== FiscalDocumentType.NOTA_CREDITO &&
        doc.status === FiscalDocumentStatus.AUTHORIZED,
    };
  }
}
