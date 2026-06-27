import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
import {
  aggregateRecipeDeductions,
  isAutoDeductOnSaleEnabled,
} from './inventory-consumption.utils';

export type InventoryDeductionReason =
  | 'deducted'
  | 'not_eligible'
  | 'disabled'
  | 'already_deducted'
  | 'no_items'
  | 'no_recipes'
  | 'nothing_to_deduct'
  | 'order_not_found';

export interface InventoryDeductionResult {
  deducted: boolean;
  reason: InventoryDeductionReason;
  itemsAffected?: number;
}

@Injectable()
export class InventoryConsumptionService {
  private readonly logger = new Logger(InventoryConsumptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Descuenta stock de insumos según recetas BOM cuando el pedido está cobrado.
   * Idempotente: un pedido solo descuenta una vez.
   */
  async tryDeductForOrder(orderId: string): Promise<InventoryDeductionResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        restaurantId: true,
        status: true,
        paymentStatus: true,
        items: {
          select: {
            dishId: true,
            quantity: true,
          },
        },
        restaurant: {
          select: { businessRules: true },
        },
      },
    });

    if (!order) {
      return { deducted: false, reason: 'order_not_found' };
    }

    if (!this.isEligible(order.status, order.paymentStatus)) {
      return { deducted: false, reason: 'not_eligible' };
    }

    if (!isAutoDeductOnSaleEnabled(order.restaurant.businessRules)) {
      return { deducted: false, reason: 'disabled' };
    }

    const existing = await this.prisma.orderInventoryDeduction.findUnique({
      where: { orderId },
      select: { id: true },
    });
    if (existing) {
      return { deducted: false, reason: 'already_deducted' };
    }

    const orderItems = order.items.filter(
      (item) => item.dishId && item.quantity > 0,
    );
    if (orderItems.length === 0) {
      return { deducted: false, reason: 'no_items' };
    }

    const dishIds = [...new Set(orderItems.map((item) => item.dishId))];
    const recipeLines = await this.prisma.dishRecipeLine.findMany({
      where: { dishId: { in: dishIds } },
      select: {
        dishId: true,
        inventoryItemId: true,
        quantity: true,
      },
    });

    if (recipeLines.length === 0) {
      return { deducted: false, reason: 'no_recipes' };
    }

    const deductByItem = aggregateRecipeDeductions(orderItems, recipeLines);
    if (deductByItem.size === 0) {
      return { deducted: false, reason: 'nothing_to_deduct' };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderInventoryDeduction.create({
        data: {
          restaurantId: order.restaurantId,
          orderId: order.id,
        },
      });

      for (const [inventoryItemId, amount] of deductByItem) {
        const updated = await tx.inventoryItem.updateMany({
          where: { id: inventoryItemId, restaurantId: order.restaurantId },
          data: {
            currentStock: { decrement: amount },
          },
        });
        if (updated.count === 0) {
          this.logger.warn(
            `Insumo ${inventoryItemId} no encontrado para restaurante ${order.restaurantId}`,
          );
        }
      }
    });

    await this.inventory.applyStockAvailability(order.restaurantId);

    this.logger.log(
      `Stock descontado pedido ${orderId}: ${deductByItem.size} insumo(s)`,
    );

    return {
      deducted: true,
      reason: 'deducted',
      itemsAffected: deductByItem.size,
    };
  }

  private isEligible(
    status: OrderStatus,
    paymentStatus: PaymentStatus,
  ): boolean {
    if (status === OrderStatus.CANCELLED) return false;
    return paymentStatus === PaymentStatus.PAID;
  }
}
