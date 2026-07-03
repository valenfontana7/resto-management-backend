import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getRestaurantProductIntent } from '../onboarding-product-intent';

export type GoLiveGateStepId =
  | 'name'
  | 'contact'
  | 'logo'
  | 'branding-contrast'
  | 'menu'
  | 'payments'
  | 'alternative-payment'
  | 'test-order'
  | 'publish';

export type GoLiveGateStep = {
  id: GoLiveGateStepId;
  label: string;
  isComplete: boolean;
};

const PUBLISH_GATE_STEP_IDS: GoLiveGateStepId[] = [
  'name',
  'contact',
  'logo',
  'branding-contrast',
  'menu',
  'payments',
  'alternative-payment',
  'test-order',
];

const MP_ENABLE_GATE_STEP_IDS: GoLiveGateStepId[] = ['name', 'contact', 'menu'];

const STEP_LABELS: Record<GoLiveGateStepId, string> = {
  name: 'Nombre y tipo de negocio',
  contact: 'Datos de contacto',
  logo: 'Logo del restaurante',
  'branding-contrast': 'Colores legibles (WCAG)',
  menu: 'Productos cargados',
  payments: 'Cobro online activo',
  'alternative-payment': 'Método alternativo activo',
  'test-order': 'Pedido de prueba completo',
  publish: 'Sitio publicado',
};

const ONLINE_PAYMENT_METHODS = new Set(['digital-wallet', 'mercadopago']);

type RestaurantGateContext = {
  id: string;
  name: string | null;
  type: string | null;
  phone: string | null;
  address: string | null;
  logo: string | null;
  isPublished: boolean;
  branding: unknown;
  businessRules: unknown;
  dishCount: number;
  mpConnected: boolean;
  completedOrdersCount: number;
  operationsOnly: boolean;
};

@Injectable()
export class GoLiveEnforcementService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanPublish(restaurantId: string): Promise<void> {
    const ctx = await this.loadContext(restaurantId);
    if (!ctx) {
      throw new BadRequestException({ error: 'Restaurant not found' });
    }

    if (ctx.isPublished || ctx.operationsOnly) {
      return;
    }

    const pending = this.getPendingSteps(ctx, PUBLISH_GATE_STEP_IDS);
    if (pending.length === 0) {
      return;
    }

    throw new BadRequestException({
      error: 'GO_LIVE_PUBLISH_BLOCKED',
      message: `Antes de publicar, completá: ${pending.map((step) => step.label).join(' · ')}`,
      pendingSteps: pending,
    });
  }

  async assertCanEnableDigitalWallet(restaurantId: string): Promise<void> {
    const ctx = await this.loadContext(restaurantId);
    if (!ctx) {
      throw new BadRequestException({ error: 'Restaurant not found' });
    }

    if (ctx.operationsOnly) {
      return;
    }

    const paymentsApplicable = this.appliesDigitalStep(ctx, 'payments');
    if (!paymentsApplicable) {
      return;
    }

    const pending = this.getPendingSteps(ctx, MP_ENABLE_GATE_STEP_IDS);
    if (pending.length === 0) {
      return;
    }

    throw new BadRequestException({
      error: 'GO_LIVE_MP_ENABLE_BLOCKED',
      message: `Antes de cobrar online, completá: ${pending.map((step) => step.label).join(' · ')}`,
      pendingSteps: pending,
    });
  }

  async canEnableDigitalWallet(restaurantId: string): Promise<boolean> {
    const ctx = await this.loadContext(restaurantId);
    if (!ctx || ctx.operationsOnly) return true;
    if (!this.appliesDigitalStep(ctx, 'payments')) return true;
    return this.getPendingSteps(ctx, MP_ENABLE_GATE_STEP_IDS).length === 0;
  }

  private async loadContext(
    restaurantId: string,
  ): Promise<RestaurantGateContext | null> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        type: true,
        phone: true,
        address: true,
        logo: true,
        isPublished: true,
        branding: true,
        businessRules: true,
        _count: { select: { dishes: true } },
      },
    });

    if (!restaurant) {
      return null;
    }

    const [mpConnected, completedOrdersCount] = await Promise.all([
      this.resolveMpConnected(restaurantId),
      this.prisma.order.count({
        where: {
          restaurantId,
          OR: [
            { orderSource: 'FLOOR_FINAL' },
            { status: { in: [OrderStatus.PAID, OrderStatus.DELIVERED] } },
          ],
        },
      }),
    ]);

    return {
      id: restaurant.id,
      name: restaurant.name,
      type: restaurant.type,
      phone: restaurant.phone,
      address: restaurant.address,
      logo: restaurant.logo,
      isPublished: restaurant.isPublished,
      branding: restaurant.branding,
      businessRules: restaurant.businessRules,
      dishCount: restaurant._count.dishes,
      mpConnected,
      completedOrdersCount,
      operationsOnly:
        getRestaurantProductIntent(restaurant.businessRules) === 'operations',
    };
  }

  private async resolveMpConnected(restaurantId: string): Promise<boolean> {
    const credential = await this.prisma.mercadoPagoCredential.findUnique({
      where: { restaurantId },
      select: { accessTokenCiphertext: true },
    });
    return Boolean(credential?.accessTokenCiphertext);
  }

  private appliesDigitalStep(
    ctx: RestaurantGateContext,
    stepId: GoLiveGateStepId,
  ): boolean {
    if (ctx.operationsOnly) {
      return ![
        'payments',
        'alternative-payment',
        'test-order',
        'publish',
        'branding-contrast',
      ].includes(stepId);
    }
    return true;
  }

  private getPendingSteps(
    ctx: RestaurantGateContext,
    stepIds: GoLiveGateStepId[],
  ): GoLiveGateStep[] {
    return stepIds
      .filter((stepId) => this.appliesDigitalStep(ctx, stepId))
      .map((stepId) => ({
        id: stepId,
        label: STEP_LABELS[stepId],
        isComplete: this.isStepComplete(ctx, stepId),
      }))
      .filter((step) => !step.isComplete);
  }

  private isStepComplete(
    ctx: RestaurantGateContext,
    stepId: GoLiveGateStepId,
  ): boolean {
    switch (stepId) {
      case 'name':
        return Boolean(ctx.name?.trim() && ctx.type?.trim());
      case 'contact':
        return Boolean(ctx.phone?.trim() && ctx.address?.trim());
      case 'logo':
        return Boolean(ctx.logo?.trim() || this.readBrandingLogo(ctx.branding));
      case 'branding-contrast':
        return this.hasBrandingTheme(ctx.branding);
      case 'menu':
        return ctx.dishCount > 0;
      case 'payments':
        return (
          ctx.mpConnected || this.hasOnlinePaymentMethod(ctx.businessRules)
        );
      case 'alternative-payment':
        return this.hasAlternativePaymentMethod(ctx.businessRules);
      case 'test-order':
        return ctx.completedOrdersCount > 0;
      case 'publish':
        return ctx.isPublished;
      default: {
        const _exhaustive: never = stepId;
        void _exhaustive;
        return true;
      }
    }
  }

  private readBrandingLogo(branding: unknown): boolean {
    if (!branding || typeof branding !== 'object') return false;
    const assets = (branding as { assets?: { logo?: unknown } }).assets;
    return Boolean(
      typeof assets?.logo === 'string' ? assets.logo.trim() : assets?.logo,
    );
  }

  private hasBrandingTheme(branding: unknown): boolean {
    if (!branding || typeof branding !== 'object') return false;
    const theme = (branding as { theme?: { colors?: { primary?: unknown } } })
      .theme;
    const primary = theme?.colors?.primary;
    return typeof primary === 'string'
      ? primary.trim().length > 0
      : Boolean(primary);
  }

  private readPaymentMethods(businessRules: unknown): string[] {
    if (!businessRules || typeof businessRules !== 'object') return [];
    const payment = (businessRules as { payment?: { methods?: unknown } })
      .payment;
    if (!Array.isArray(payment?.methods)) return [];
    return payment.methods.map((method) =>
      this.normalizePaymentMethod(String(method)),
    );
  }

  private normalizePaymentMethod(method: string): string {
    const normalized = method.trim().toLowerCase();
    if (normalized === 'mercadopago' || normalized === 'mercado-pago') {
      return 'digital-wallet';
    }
    return normalized;
  }

  private hasOnlinePaymentMethod(businessRules: unknown): boolean {
    return this.readPaymentMethods(businessRules).some((method) =>
      ONLINE_PAYMENT_METHODS.has(method),
    );
  }

  private hasAlternativePaymentMethod(businessRules: unknown): boolean {
    return this.readPaymentMethods(businessRules).some(
      (method) => method && !ONLINE_PAYMENT_METHODS.has(method),
    );
  }
}
