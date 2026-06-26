import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FiscalDocumentStatus, NotificationType } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FiscalDocumentService } from './fiscal-document.service';

function isSkippedPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  return (payload as Record<string, unknown>).skipped === true;
}

@Injectable()
export class FiscalRetrySchedulerService {
  private readonly logger = new Logger(FiscalRetrySchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscalDocuments: FiscalDocumentService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/10 * * * *')
  async retryPendingDocuments(): Promise<void> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const pending = await this.prisma.fiscalDocument.findMany({
      where: {
        status: FiscalDocumentStatus.PENDING_AFIP,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });

    const retryable = pending.filter((doc) => !isSkippedPayload(doc.payload));
    if (retryable.length === 0) return;

    this.logger.log(
      `Reintentando ${retryable.length} comprobante(s) PENDING_AFIP`,
    );

    for (const doc of retryable) {
      try {
        await this.fiscalDocuments.retryAuthorization(doc.restaurantId, doc.id);
      } catch (error) {
        this.logger.warn(
          `Retry fiscal falló · doc=${doc.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  @Cron('15 * * * *')
  async alertStalePendingDocuments(): Promise<void> {
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stale = await this.prisma.fiscalDocument.findMany({
      where: {
        status: FiscalDocumentStatus.PENDING_AFIP,
        createdAt: { lte: staleBefore },
      },
      select: {
        id: true,
        restaurantId: true,
        type: true,
        total: true,
        createdAt: true,
      },
      take: 50,
    });

    for (const doc of stale) {
      const alreadyNotified = await this.prisma.notification.findFirst({
        where: {
          restaurantId: doc.restaurantId,
          type: NotificationType.CUSTOM,
          data: {
            path: ['fiscalDocumentId'],
            equals: doc.id,
          },
        },
      });
      if (alreadyNotified) continue;

      const owners = await this.prisma.restaurantMembership.findMany({
        where: {
          restaurantId: doc.restaurantId,
          role: { name: 'OWNER' },
        },
        select: { userId: true },
      });

      for (const owner of owners) {
        await this.notifications.createAndSend({
          userId: owner.userId,
          restaurantId: doc.restaurantId,
          type: NotificationType.CUSTOM,
          title: 'Comprobante fiscal pendiente ARCA',
          message:
            'Hay un comprobante sin CAE hace más de 24 horas. Revisá Comprobantes o la configuración ARCA.',
          data: {
            fiscalDocumentId: doc.id,
            kind: 'fiscal_pending_stale',
          },
        });
      }
    }
  }
}
