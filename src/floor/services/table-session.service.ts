import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ComandaItemStatus,
  FiscalDocumentType,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  Prisma,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import {
  isSalonSellable,
  resolveSalonUnitPrice,
} from '../../common/utils/dish-channel-pricing';
import { KitchenNotificationsService } from '../../kitchen/kitchen-notifications.service';
import { OrderNotificationsService } from '../../orders/services/order-notifications.service';
import { FloorDiscountService } from './floor-discount.service';
import { CashRegisterService } from './cash-register.service';
import { FiscalDocumentService } from './fiscal-document.service';
import { InventoryConsumptionService } from '../../business-health/inventory-consumption.service';
import { FloorAccessService } from './floor-access.service';
import { OperationalEventEmitter } from '../../event-spine/operational-event-emitter.service';
import { OPERATIONAL_EVENT_TYPES } from '../../event-spine/operational-event.types';
import {
  AddSessionItemsDto,
  CloseTableSessionDto,
  OpenTableSessionDto,
  SendToKitchenDto,
} from '../dto/table-session.dto';
import {
  OrderType,
  OrderStatus as OrderStatusDto,
} from '../../orders/dto/order.dto';

const SESSION_INCLUDE = {
  table: { include: { area: true } },
  items: {
    include: { modifiers: true, dish: true },
    orderBy: { createdAt: 'asc' as const },
  },
  finalOrder: true,
} satisfies Prisma.TableSessionInclude;

@Injectable()
export class TableSessionService {
  private readonly logger = new Logger(TableSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly discounts: FloorDiscountService,
    private readonly kitchenNotifications: KitchenNotificationsService,
    private readonly orderNotifications: OrderNotificationsService,
    private readonly cashRegister: CashRegisterService,
    private readonly fiscalDocuments: FiscalDocumentService,
    private readonly inventoryConsumption: InventoryConsumptionService,
    private readonly floorAccess: FloorAccessService,
    private readonly operationalEvents: OperationalEventEmitter,
  ) {}

  async listActive(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const sessions = await this.prisma.tableSession.findMany({
      where: { restaurantId, status: TableSessionStatus.OPEN },
      include: SESSION_INCLUDE,
      orderBy: { openedAt: 'asc' },
    });
    return { sessions: sessions.map((s) => this.formatSession(s)) };
  }

  async getById(restaurantId: string, sessionId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const session = await this.findSessionOrThrow(restaurantId, sessionId);
    return { session: this.formatSession(session) };
  }

  async open(
    restaurantId: string,
    userId: string,
    dto: OpenTableSessionDto,
    userName?: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const table = await this.prisma.table.findFirst({
      where: { id: dto.tableId, restaurantId },
    });
    if (!table) {
      throw new NotFoundException('Mesa no encontrada');
    }
    if (table.currentSessionId) {
      throw new BadRequestException('La mesa ya tiene una cuenta abierta');
    }
    if (table.status === TableStatus.RESERVED) {
      throw new BadRequestException(
        'La mesa está reservada. Liberá la reserva antes de abrir cuenta.',
      );
    }

    const sessionNumber = await this.generateSessionNumber(restaurantId);
    const cashRegisterSession =
      await this.cashRegister.getOpenSessionRecord(restaurantId);

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tableSession.create({
        data: {
          restaurantId,
          tableId: dto.tableId,
          sessionNumber,
          waiterId: userId,
          waiterName: dto.waiterName ?? userName ?? null,
          guestCount: dto.guestCount ?? 1,
          customerName: dto.customerName ?? null,
          notes: dto.notes ?? null,
          cashRegisterSessionId: cashRegisterSession?.id ?? null,
        },
        include: SESSION_INCLUDE,
      });

      await tx.table.update({
        where: { id: dto.tableId },
        data: {
          status: TableStatus.OCCUPIED,
          currentSessionId: created.id,
          customerName: dto.customerName ?? null,
          occupiedSince: new Date(),
          waiter: dto.waiterName ?? userName ?? null,
        },
      });

      return created;
    });

    void this.operationalEvents.emit({
      restaurantId,
      eventType: OPERATIONAL_EVENT_TYPES.TABLE_SESSION_OPENED,
      aggregateType: 'table_session',
      aggregateId: session.id,
      data: {
        tableId: dto.tableId,
        sessionNumber,
        waiterId: userId,
      },
    });

    return { session: this.formatSession(session) };
  }

  async addItems(
    restaurantId: string,
    sessionId: string,
    userId: string,
    dto: AddSessionItemsDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const session = await this.findSessionOrThrow(restaurantId, sessionId);

    if (session.status !== TableSessionStatus.OPEN) {
      throw new BadRequestException('La cuenta no está abierta');
    }
    if (!dto.items?.length) {
      throw new BadRequestException('items is required');
    }

    const dishIds = dto.items.map((i) => i.dishId);
    const dishes = await this.prisma.dish.findMany({
      where: {
        id: { in: dishIds },
        restaurantId,
        deletedAt: null,
        isAvailableInSalon: true,
      },
    });
    if (dishes.length !== dishIds.length) {
      throw new BadRequestException(
        'Algunos platos no están disponibles en salón o no existen',
      );
    }
    const dishMap = new Map(
      dishes.filter(isSalonSellable).map((d) => [d.id, d]),
    );
    if (dishMap.size !== dishIds.length) {
      throw new BadRequestException(
        'Algunos platos no están disponibles en salón',
      );
    }

    const sendImmediately = dto.items.some((i) => i.sendToKitchen);
    const roundNumber = session.comandaRound + (sendImmediately ? 1 : 0);

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const dish = dishMap.get(item.dishId)!;
        const modifierTotal = (item.modifiers ?? []).reduce(
          (sum, m) => sum + Math.round(Number(m.priceAdjustment) || 0),
          0,
        );
        const unitPrice = resolveSalonUnitPrice(dish) + modifierTotal;
        const subtotal = unitPrice * item.quantity;

        await tx.tableSessionItem.create({
          data: {
            sessionId,
            dishId: dish.id,
            name: dish.name,
            quantity: item.quantity,
            unitPrice,
            subtotal,
            notes: item.notes ?? null,
            roundNumber: item.sendToKitchen
              ? roundNumber
              : session.comandaRound || 1,
            kitchenStatus: item.sendToKitchen
              ? ComandaItemStatus.PENDING
              : ComandaItemStatus.PENDING,
            modifiers: item.modifiers?.length
              ? {
                  create: item.modifiers.map((m) => ({
                    modifierId: m.modifierId,
                    name: m.name,
                    priceAdjustment: Math.round(Number(m.priceAdjustment) || 0),
                  })),
                }
              : undefined,
          },
        });
      }

      if (sendImmediately) {
        await tx.tableSession.update({
          where: { id: sessionId },
          data: { comandaRound: roundNumber },
        });
      }
    });

    await this.recalculateTotals(sessionId);

    if (sendImmediately) {
      await this.sendToKitchen(restaurantId, sessionId, userId, {
        itemIds: undefined,
      });
    }

    const updated = await this.findSessionOrThrow(restaurantId, sessionId);
    return { session: this.formatSession(updated) };
  }

  async sendToKitchen(
    restaurantId: string,
    sessionId: string,
    userId: string,
    dto: SendToKitchenDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const session = await this.findSessionOrThrow(restaurantId, sessionId);

    if (session.status !== TableSessionStatus.OPEN) {
      throw new BadRequestException('La cuenta no está abierta');
    }

    const pendingItems = session.items.filter(
      (item) =>
        item.kitchenStatus === ComandaItemStatus.PENDING &&
        (!dto.itemIds?.length || dto.itemIds.includes(item.id)),
    );

    if (!pendingItems.length) {
      throw new BadRequestException(
        'No hay ítems pendientes para enviar a cocina',
      );
    }

    const roundNumber = session.comandaRound + 1;
    const orderNumber = await this.generateOrderNumber(restaurantId);
    const tableLabel = session.table?.number ?? session.tableId;

    const comandaOrder = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          restaurantId,
          orderNumber,
          publicTrackingToken: crypto.randomBytes(32).toString('base64url'),
          customerName: session.customerName ?? `Mesa ${tableLabel}`,
          customerPhone: '0000000000',
          type: OrderType.DINE_IN,
          status: OrderStatus.PREPARING,
          paymentMethod: 'pending',
          paymentStatus: PaymentStatus.PENDING,
          subtotal: pendingItems.reduce((s, i) => s + i.subtotal, 0),
          total: pendingItems.reduce((s, i) => s + i.subtotal, 0),
          tableId: session.tableId,
          tableSessionId: sessionId,
          orderSource: OrderSource.FLOOR_COMANDA,
          notes: `Comanda mesa ${tableLabel} · ${session.sessionNumber}`,
          preparingAt: new Date(),
          items: {
            create: pendingItems.map((item) => ({
              dishId: item.dishId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
              notes: item.notes,
              ...(item.modifiers.length
                ? {
                    selectedModifiers: {
                      create: item.modifiers.map((m) => ({
                        modifierId: m.modifierId,
                        name: m.name,
                        priceAdjustment: m.priceAdjustment,
                      })),
                    },
                  }
                : {}),
            })),
          },
          statusHistory: {
            create: {
              toStatus: OrderStatus.PREPARING,
              changedBy: userId,
              notes: 'Comanda de salón enviada a cocina',
            },
          },
        },
        include: {
          items: { include: { dish: true, selectedModifiers: true } },
        },
      });

      await tx.tableSessionItem.updateMany({
        where: { id: { in: pendingItems.map((i) => i.id) } },
        data: {
          kitchenStatus: ComandaItemStatus.SENT,
          comandaOrderId: order.id,
          sentToKitchenAt: new Date(),
          roundNumber,
        },
      });

      await tx.tableSession.update({
        where: { id: sessionId },
        data: { comandaRound: roundNumber },
      });

      return order;
    });

    this.orderNotifications.emitNewOrderCreated(restaurantId, comandaOrder);
    void this.orderNotifications.emitKitchenNotification(
      comandaOrder,
      OrderStatusDto.PREPARING,
    );

    void this.operationalEvents.emit({
      restaurantId,
      eventType: OPERATIONAL_EVENT_TYPES.ORDER_CREATED,
      aggregateType: 'order',
      aggregateId: comandaOrder.id,
      data: {
        orderId: comandaOrder.id,
        source: 'floor',
        sessionId,
        sessionNumber: session.sessionNumber,
        tableNumber: tableLabel,
        roundNumber,
      },
    });

    void this.operationalEvents.emit({
      restaurantId,
      eventType: OPERATIONAL_EVENT_TYPES.TABLE_SESSION_ITEM_SENT,
      aggregateType: 'table_session',
      aggregateId: sessionId,
      data: {
        orderId: comandaOrder.id,
        itemIds: pendingItems.map((item) => item.id),
        roundNumber,
      },
    });

    const updated = await this.findSessionOrThrow(restaurantId, sessionId);
    return {
      session: this.formatSession(updated),
      comandaOrderId: comandaOrder.id,
      orderNumber: comandaOrder.orderNumber,
    };
  }

  async previewClose(
    restaurantId: string,
    sessionId: string,
    userId: string,
    paymentMethod: string,
    itemIds?: string[],
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    await this.floorAccess.verifyCollectAccess(restaurantId, userId);
    const session = await this.findSessionOrThrow(restaurantId, sessionId);

    if (session.status !== TableSessionStatus.OPEN) {
      throw new BadRequestException('La cuenta no está abierta');
    }

    const payableItems = this.resolvePayableItems(session, itemIds);
    if (!payableItems.length) {
      throw new BadRequestException('No hay ítems seleccionados para cobrar');
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });

    const subtotal = payableItems.reduce((s, i) => s + i.subtotal, 0);
    const paymentDiscount = this.discounts.applyPaymentMethodDiscount(
      subtotal,
      restaurant?.businessRules,
      paymentMethod,
    );
    const normalized = this.discounts.normalizePaymentMethod(paymentMethod);
    const total = Math.max(0, subtotal - paymentDiscount.paymentMethodDiscount);
    const unpaidRemaining = this.getUnpaidItems(session).filter(
      (i) => !payableItems.some((p) => p.id === i.id),
    );

    return {
      subtotal,
      paymentMethodDiscount: paymentDiscount.paymentMethodDiscount,
      discountPercent: paymentDiscount.discountPercent,
      manualDiscount: 0,
      totalDiscount: paymentDiscount.paymentMethodDiscount,
      tip: 0,
      total,
      paymentMethod: normalized,
      itemCount: payableItems.length,
      pendingKitchenCount: payableItems.filter(
        (i) => i.kitchenStatus === ComandaItemStatus.PENDING,
      ).length,
      partial: unpaidRemaining.length > 0,
      remainingItemCount: unpaidRemaining.length,
      remainingSubtotal: unpaidRemaining.reduce((s, i) => s + i.subtotal, 0),
    };
  }

  async close(
    restaurantId: string,
    sessionId: string,
    userId: string,
    dto: CloseTableSessionDto,
    userName?: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    await this.floorAccess.verifyCollectAccess(restaurantId, userId);
    const session = await this.findSessionOrThrow(restaurantId, sessionId);

    if (session.status !== TableSessionStatus.OPEN) {
      throw new BadRequestException('La cuenta no está abierta');
    }

    const allUnpaid = this.getUnpaidItems(session);
    const payableItems = this.resolvePayableItems(session, dto.itemIds);
    if (!payableItems.length) {
      throw new BadRequestException('La cuenta no tiene ítems para cobrar');
    }

    const pendingKitchen = payableItems.some(
      (i) => i.kitchenStatus === ComandaItemStatus.PENDING,
    );
    if (pendingKitchen) {
      throw new BadRequestException(
        'Hay ítems sin enviar a cocina. Enviá la comanda o eliminá los ítems pendientes.',
      );
    }

    const isPartial = payableItems.length < allUnpaid.length;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });

    const subtotal = payableItems.reduce((s, i) => s + i.subtotal, 0);
    const paymentDiscount = this.discounts.applyPaymentMethodDiscount(
      subtotal,
      restaurant?.businessRules,
      dto.paymentMethod,
    );
    const manualDiscount = dto.manualDiscount ?? 0;
    const totalDiscount =
      paymentDiscount.paymentMethodDiscount + manualDiscount;
    const tip = dto.tip ?? 0;
    const total = Math.max(0, subtotal - totalDiscount + tip);

    const orderNumber = await this.generateOrderNumber(restaurantId);
    const tableLabel = session.table?.number ?? session.tableId;
    const paymentMethod = this.discounts.normalizePaymentMethod(
      dto.paymentMethod,
    );
    const isCash = paymentMethod === 'cash';

    const result = await this.prisma.$transaction(async (tx) => {
      const paymentOrder = await tx.order.create({
        data: {
          restaurantId,
          orderNumber,
          publicTrackingToken: crypto.randomBytes(32).toString('base64url'),
          customerName:
            dto.customerName ?? session.customerName ?? `Mesa ${tableLabel}`,
          customerPhone: dto.customerPhone ?? '0000000000',
          type: OrderType.DINE_IN,
          status: isCash ? OrderStatus.DELIVERED : OrderStatus.CONFIRMED,
          paymentMethod,
          paymentStatus: isCash ? PaymentStatus.PAID : PaymentStatus.PENDING,
          subtotal,
          discount: totalDiscount,
          tip,
          total,
          tableId: session.tableId,
          tableSessionId: sessionId,
          orderSource: OrderSource.FLOOR_FINAL,
          paidAt: isCash ? new Date() : null,
          deliveredAt: isCash ? new Date() : null,
          notes: isPartial
            ? `Pago parcial · Mesa ${tableLabel} · ${session.sessionNumber}`
            : session.notes,
          items: {
            create: payableItems.map((item) => ({
              dishId: item.dishId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
              notes: item.notes,
              ...(item.modifiers.length
                ? {
                    selectedModifiers: {
                      create: item.modifiers.map((m) => ({
                        modifierId: m.modifierId,
                        name: m.name,
                        priceAdjustment: m.priceAdjustment,
                      })),
                    },
                  }
                : {}),
            })),
          },
          statusHistory: {
            create: {
              toStatus: isCash ? OrderStatus.DELIVERED : OrderStatus.CONFIRMED,
              changedBy: userId,
              notes: isPartial
                ? 'Pago parcial de cuenta de salón'
                : 'Cuenta de salón cerrada',
            },
          },
        },
        include: {
          items: { include: { dish: true, selectedModifiers: true } },
        },
      });

      await tx.tableSessionItem.updateMany({
        where: { id: { in: payableItems.map((i) => i.id) } },
        data: {
          paidInOrderId: paymentOrder.id,
          kitchenStatus: ComandaItemStatus.SERVED,
        },
      });

      const remainingUnpaid = allUnpaid.filter(
        (i) => !payableItems.some((p) => p.id === i.id),
      );

      if (isPartial && remainingUnpaid.length > 0) {
        const remainingSubtotal = remainingUnpaid.reduce(
          (s, i) => s + i.subtotal,
          0,
        );
        const openSession = await tx.tableSession.update({
          where: { id: sessionId },
          data: {
            subtotal: remainingSubtotal,
            total: remainingSubtotal,
          },
          include: SESSION_INCLUDE,
        });
        return { paymentOrder, session: openSession, partial: true as const };
      }

      await tx.tableSession.update({
        where: { id: sessionId },
        data: { status: TableSessionStatus.CLOSING },
      });

      const closedSession = await tx.tableSession.update({
        where: { id: sessionId },
        data: {
          status: TableSessionStatus.CLOSED,
          closedAt: new Date(),
          subtotal,
          discount: manualDiscount,
          paymentMethodDiscount: paymentDiscount.paymentMethodDiscount,
          discountReason:
            dto.discountReason ??
            (paymentDiscount.discountPercent
              ? `Descuento ${paymentDiscount.discountPercent}% ${paymentMethod}`
              : null),
          tip,
          total,
          orderId: paymentOrder.id,
        },
        include: SESSION_INCLUDE,
      });

      await tx.table.update({
        where: { id: session.tableId },
        data: {
          status: TableStatus.CLEANING,
          currentSessionId: null,
          currentOrderId: null,
          customerName: null,
          waiter: null,
          occupiedSince: null,
        },
      });

      return { paymentOrder, session: closedSession, partial: false as const };
    });

    if (isCash) {
      await this.cashRegister.recordSale(restaurantId, {
        amount: total,
        paymentMethod,
        orderId: result.paymentOrder.id,
        tableSessionId: sessionId,
        createdByUserId: userId,
        createdByName: userName,
        description: isPartial
          ? `Pago parcial mesa ${tableLabel} · ${session.sessionNumber}`
          : `Mesa ${tableLabel} · ${session.sessionNumber}`,
      });
    }

    let fiscalDocument: Awaited<
      ReturnType<FiscalDocumentService['createForSession']>
    > | null = null;
    if (dto.fiscalDocumentType) {
      fiscalDocument = await this.fiscalDocuments.createForSession(
        restaurantId,
        sessionId,
        result.paymentOrder.id,
        {
          type: dto.fiscalDocumentType as FiscalDocumentType,
          subtotal,
          total,
          customerDocType: dto.customerDocType,
          customerDocNumber: dto.customerDocNumber,
          customerName: dto.customerName ?? session.customerName ?? undefined,
          customerIvaCondition: dto.customerIvaCondition,
        },
      );
    }

    this.orderNotifications.emitNewOrderCreated(
      restaurantId,
      result.paymentOrder,
    );

    if (isCash) {
      void this.inventoryConsumption
        .tryDeductForOrder(result.paymentOrder.id)
        .catch((error) => {
          this.logger.warn(
            `Descuento de inventario falló mesa ${sessionId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    const remainingUnpaid = this.getUnpaidItems(result.session).filter(
      (i) => !i.paidInOrderId,
    );

    if (!result.partial) {
      void this.operationalEvents.emit({
        restaurantId,
        eventType: OPERATIONAL_EVENT_TYPES.TABLE_SESSION_CLOSED,
        aggregateType: 'table_session',
        aggregateId: sessionId,
        data: {
          orderId: result.paymentOrder.id,
          total,
          paymentMethod,
          isPartial: false,
        },
      });
    }

    if (fiscalDocument) {
      void this.operationalEvents.emit({
        restaurantId,
        eventType: OPERATIONAL_EVENT_TYPES.FISCAL_DOCUMENT_ISSUED,
        aggregateType: 'fiscal_document',
        aggregateId: fiscalDocument.id,
        data: {
          sessionId,
          orderId: result.paymentOrder.id,
          type: dto.fiscalDocumentType,
        },
      });
    }

    return {
      session: this.formatSession(result.session),
      order: {
        id: result.paymentOrder.id,
        orderNumber: result.paymentOrder.orderNumber,
        total: result.paymentOrder.total,
        paymentMethod: result.paymentOrder.paymentMethod,
        paymentStatus: result.paymentOrder.paymentStatus,
      },
      fiscalDocument,
      partial: result.partial,
      remainingSubtotal: remainingUnpaid.reduce((s, i) => s + i.subtotal, 0),
      remainingItemCount: remainingUnpaid.length,
    };
  }

  async cancel(restaurantId: string, sessionId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const session = await this.findSessionOrThrow(restaurantId, sessionId);

    if (session.status !== TableSessionStatus.OPEN) {
      throw new BadRequestException('Solo se pueden cancelar cuentas abiertas');
    }

    const hasSentItems = session.items.some(
      (i) => i.kitchenStatus !== ComandaItemStatus.PENDING,
    );
    if (hasSentItems) {
      throw new BadRequestException(
        'No se puede cancelar: ya hay ítems enviados a cocina',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tableSession.update({
        where: { id: sessionId },
        data: { status: TableSessionStatus.CANCELLED, closedAt: new Date() },
      });
      await tx.table.update({
        where: { id: session.tableId },
        data: {
          status: TableStatus.AVAILABLE,
          currentSessionId: null,
          customerName: null,
          waiter: null,
          occupiedSince: null,
        },
      });
    });

    return { success: true };
  }

  async voidSession(
    restaurantId: string,
    sessionId: string,
    userId: string,
    dto: { reason?: string; markTableCleaning?: boolean },
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const session = await this.findSessionOrThrow(restaurantId, sessionId);

    if (session.status !== TableSessionStatus.OPEN) {
      throw new BadRequestException('Solo se pueden liberar cuentas abiertas');
    }

    const comandaOrderIds = [
      ...new Set(
        session.items
          .map((item) => item.comandaOrderId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const markCleaning = dto.markTableCleaning !== false;
    const voidNote =
      dto.reason?.trim() || 'Cuenta liberada sin cobro desde salón';

    const cancelledOrderIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const orderId of comandaOrderIds) {
        const comanda = await tx.order.findFirst({
          where: { id: orderId, restaurantId },
        });
        if (
          !comanda ||
          comanda.status === OrderStatus.CANCELLED ||
          comanda.status === OrderStatus.DELIVERED
        ) {
          continue;
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.CANCELLED,
            statusHistory: {
              create: {
                fromStatus: comanda.status,
                toStatus: OrderStatus.CANCELLED,
                changedBy: userId,
                notes: voidNote,
              },
            },
          },
        });
        cancelledOrderIds.push(orderId);
      }

      await tx.tableSessionItem.updateMany({
        where: { sessionId, paidInOrderId: null },
        data: { kitchenStatus: ComandaItemStatus.CANCELLED },
      });

      await tx.tableSession.update({
        where: { id: sessionId },
        data: {
          status: TableSessionStatus.CANCELLED,
          closedAt: new Date(),
          notes: session.notes
            ? `${session.notes}\n[Anulada] ${voidNote}`
            : `[Anulada] ${voidNote}`,
        },
      });

      await tx.table.update({
        where: { id: session.tableId },
        data: {
          status: markCleaning ? TableStatus.CLEANING : TableStatus.AVAILABLE,
          currentSessionId: null,
          currentOrderId: null,
          customerName: null,
          waiter: null,
          occupiedSince: null,
        },
      });
    });

    for (const orderId of cancelledOrderIds) {
      this.kitchenNotifications.emitNotification(restaurantId, {
        type: 'order_cancelled',
        orderId,
        data: { source: 'floor_void', sessionId },
      });
    }

    return {
      success: true,
      tableStatus: markCleaning ? 'CLEANING' : 'AVAILABLE',
    };
  }

  private async recalculateTotals(sessionId: string) {
    const items = await this.prisma.tableSessionItem.findMany({
      where: {
        sessionId,
        kitchenStatus: { not: ComandaItemStatus.CANCELLED },
        paidInOrderId: null,
      },
    });
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    await this.prisma.tableSession.update({
      where: { id: sessionId },
      data: { subtotal, total: subtotal },
    });
  }

  private getUnpaidItems<
    T extends {
      id: string;
      kitchenStatus: ComandaItemStatus;
      paidInOrderId?: string | null;
      subtotal: number;
    },
  >(session: { items: T[] }): T[] {
    return session.items.filter(
      (i) =>
        i.kitchenStatus !== ComandaItemStatus.CANCELLED && !i.paidInOrderId,
    );
  }

  private resolvePayableItems<
    T extends {
      id: string;
      kitchenStatus: ComandaItemStatus;
      paidInOrderId?: string | null;
      subtotal: number;
    },
  >(session: { items: T[] }, itemIds?: string[]): T[] {
    const unpaid = this.getUnpaidItems(session);
    if (!itemIds?.length) {
      return unpaid;
    }

    const idSet = new Set(itemIds);
    const selected = unpaid.filter((i) => idSet.has(i.id));
    if (selected.length !== itemIds.length) {
      throw new BadRequestException(
        'Algunos ítems no están disponibles para cobrar',
      );
    }
    return selected;
  }

  private async findSessionOrThrow(restaurantId: string, sessionId: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, restaurantId },
      include: SESSION_INCLUDE,
    });
    if (!session) {
      throw new NotFoundException('Cuenta de mesa no encontrada');
    }
    return session;
  }

  private async generateSessionNumber(restaurantId: string): Promise<string> {
    const today = new Date();
    const dateStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('');
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    const count = await this.prisma.tableSession.count({
      where: {
        restaurantId,
        openedAt: { gte: start, lte: end },
      },
    });
    return `M-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }

  private async generateOrderNumber(restaurantId: string): Promise<string> {
    const today = new Date();
    const dateStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('');
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    const count = await this.prisma.order.count({
      where: {
        restaurantId,
        createdAt: { gte: start, lte: end },
      },
    });
    return `OD-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }

  private formatSession(session: any) {
    return {
      id: session.id,
      sessionNumber: session.sessionNumber,
      status: session.status,
      tableId: session.tableId,
      table: session.table
        ? {
            id: session.table.id,
            number: session.table.number,
            capacity: session.table.capacity,
            status: session.table.status,
            area: session.table.area?.name ?? null,
          }
        : null,
      waiterId: session.waiterId,
      waiterName: session.waiterName,
      guestCount: session.guestCount,
      customerName: session.customerName,
      notes: session.notes,
      subtotal: session.subtotal,
      discount: session.discount,
      paymentMethodDiscount: session.paymentMethodDiscount,
      discountReason: session.discountReason,
      tip: session.tip,
      total: session.total,
      comandaRound: session.comandaRound,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      orderId: session.orderId,
      items: (session.items ?? []).map((item: any) => ({
        id: item.id,
        dishId: item.dishId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes,
        roundNumber: item.roundNumber,
        kitchenStatus: item.kitchenStatus,
        comandaOrderId: item.comandaOrderId,
        paidInOrderId: item.paidInOrderId ?? null,
        sentToKitchenAt: item.sentToKitchenAt,
        modifiers: (item.modifiers ?? []).map((m: any) => ({
          id: m.id,
          modifierId: m.modifierId,
          name: m.name,
          priceAdjustment: m.priceAdjustment,
        })),
      })),
    };
  }
}
