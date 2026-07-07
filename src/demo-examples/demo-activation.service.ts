import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { BuilderService } from '../builder/builder.service';
import { asOptionalString } from '../common/json-coerce';
import {
  DEFAULT_BUILDER_CONFIG,
  type BuilderConfiguration,
} from '../builder/types/builder-config.types';
import { PrismaService } from '../prisma/prisma.service';
import { DemoExamplesService } from './demo-examples.service';
import {
  buildBuilderDraftFromPayload,
  buildSuggestedRestaurantSlug,
  countDemoDishes,
  extractDemoMenu,
  mapDemoMenuCategories,
  normalizeBusinessType,
  parseDemoPayloadHours,
  pickImageRef,
  remapFeaturedDishIds,
  asRecord,
  asStringArray,
} from './demo-activation.mapper';

export type DemoOnboardingSeedResponse = {
  demoExampleSlug: string;
  leadId?: string | null;
  restaurantName: string;
  suggestedSlug: string;
  onboardingData: Record<string, unknown>;
};

@Injectable()
export class DemoActivationService {
  private readonly logger = new Logger(DemoActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly demoExamplesService: DemoExamplesService,
    private readonly builderService: BuilderService,
  ) {}

  async buildOnboardingSeed(slug: string): Promise<DemoOnboardingSeedResponse> {
    const record = await this.demoExamplesService.findBySlug(slug);
    const payload = asRecord(record.payload) ?? {};
    const location = asRecord(payload.location);
    const contact = asRecord(payload.contact);
    const menu = payload.menu;

    const restaurantName =
      record.name?.trim() || asOptionalString(payload.name, slug).trim();
    const leadId =
      record.leadId ??
      (typeof payload.leadId === 'string' ? payload.leadId : null) ??
      null;

    const hours = parseDemoPayloadHours(
      asRecord(payload.hours) as Record<string, string> | undefined,
    );

    const categories = mapDemoMenuCategories(menu);
    const builderDraft = buildBuilderDraftFromPayload(payload);
    const description = asOptionalString(payload.description).trim();

    const onboardingData = {
      productIntent: 'both',
      planSelection: {
        selectedPlan: 'PROFESSIONAL',
      },
      businessInfo: {
        restaurantName,
        businessType: normalizeBusinessType(record.type ?? payload.type),
        cuisine: asStringArray(
          record.cuisine?.length ? record.cuisine : payload.cuisine,
        ),
        description,
        logo: null,
      },
      contact: {
        email: asOptionalString(contact?.email).trim(),
        phone: asOptionalString(contact?.phone).trim(),
        address: asOptionalString(location?.address).trim(),
        city: asOptionalString(record.city ?? location?.city).trim(),
        country: 'Argentina',
        postalCode: '',
      },
      hours,
      menuSetup: {
        setupMethod: 'import' as const,
        categories,
        estimatedDishes: countDemoDishes(menu),
      },
      paymentMethods: {
        enabledMethods: ['cash', 'mercadopago'],
        requirePrepayment: false,
        acceptTips: true,
        tipPercentages: [10, 15, 20],
      },
      deliveryZones: {
        enabled: true,
        zones: [],
        estimatedTime: '30-45 min',
      },
      demoActivation: {
        demoExampleSlug: record.slug,
        leadId: leadId ?? undefined,
        restaurantName,
      },
      aiDraft: {
        businessInfo: {
          restaurantName,
          businessType: normalizeBusinessType(record.type ?? payload.type),
          cuisine: asStringArray(
            record.cuisine?.length ? record.cuisine : payload.cuisine,
          ),
          description,
        },
        contact: {
          email: asOptionalString(contact?.email).trim(),
          phone: asOptionalString(contact?.phone).trim(),
          address: asOptionalString(location?.address).trim(),
          city: asOptionalString(record.city ?? location?.city).trim(),
          country: 'Argentina',
          postalCode: '',
        },
        hours,
        menuSetup: {
          setupMethod: 'import' as const,
          categories,
          estimatedDishes: countDemoDishes(menu),
        },
        paymentMethods: {
          enabledMethods: ['cash', 'mercadopago'],
          requirePrepayment: false,
          acceptTips: true,
          tipPercentages: [10, 15, 20],
        },
        deliveryZones: {
          enabled: true,
          zones: [],
          estimatedTime: '30-45 min',
        },
        builderDraft,
        assumptions: [
          'Datos importados desde tu demo personalizada de Bentoo.',
          'Trial PRO incluido para conservar menú y sitio completos.',
        ],
      },
    };

    return {
      demoExampleSlug: record.slug,
      leadId,
      restaurantName,
      suggestedSlug: buildSuggestedRestaurantSlug(restaurantName, record.slug),
      onboardingData,
    };
  }

  async materializeFromDemoExample(
    restaurantId: string,
    demoExampleSlug: string,
    userId?: string,
  ): Promise<{ leadId?: string }> {
    const normalizedSlug = demoExampleSlug.trim().toLowerCase();
    if (!normalizedSlug) {
      throw new NotFoundException('Demo slug requerido');
    }

    const record = await this.demoExamplesService.findBySlug(normalizedSlug);
    const payload = asRecord(record.payload) ?? {};
    const menuCategories = extractDemoMenu(payload.menu);
    const dishIdMap = new Map<string, string>();

    const branding = asRecord(payload.branding);
    const assets = asRecord(branding?.assets);
    const images = asRecord(payload.images);

    const logo = pickImageRef(assets?.logo, images?.logo);
    const coverImage = pickImageRef(
      assets?.coverImage,
      assets?.bannerImage,
      images?.hero,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const [index, category] of menuCategories.entries()) {
        const createdCategory = await tx.category.create({
          data: {
            restaurantId,
            name: category.name,
            description: category.description ?? null,
            image: category.image ?? null,
            order: category.order ?? index + 1,
            isActive: true,
          },
        });

        for (const dish of category.dishes ?? []) {
          const createdDish = await tx.dish.create({
            data: {
              restaurantId,
              categoryId: createdCategory.id,
              name: dish.name,
              description: dish.description ?? null,
              price: Math.max(0, Math.round(dish.price ?? 0)),
              image: dish.image ?? null,
              isFeatured: dish.isFeatured ?? false,
              preparationTime: dish.preparationTime ?? null,
              allergens: dish.allergens ?? [],
              isAvailable: true,
              isAvailableInSalon: true,
            },
          });

          if (dish.id) {
            dishIdMap.set(dish.id, createdDish.id);
          }
        }
      }

      if (logo || coverImage) {
        await tx.restaurant.update({
          where: { id: restaurantId },
          data: {
            ...(logo ? { logo } : {}),
            ...(coverImage ? { coverImage } : {}),
          },
        });
      }
    });

    const builderDraft = buildBuilderDraftFromPayload(payload);
    const remappedDraft = remapFeaturedDishIds(builderDraft, dishIdMap);
    const builderConfig = {
      ...DEFAULT_BUILDER_CONFIG,
      ...remappedDraft,
      lastModified: new Date().toISOString(),
    } as BuilderConfiguration;

    await this.builderService.replaceConfig(
      restaurantId,
      builderConfig,
      userId,
    );
    await this.builderService.publishConfig(restaurantId);

    const leadId =
      record.leadId ??
      (typeof payload.leadId === 'string' ? payload.leadId : undefined);

    if (leadId) {
      await this.linkLeadConversion(leadId, restaurantId, userId);
    }

    this.logger.log(
      `Demo activated: ${normalizedSlug} → restaurant ${restaurantId}${
        leadId ? ` (lead ${leadId})` : ''
      }`,
    );

    return { leadId };
  }

  private async linkLeadConversion(
    leadId: string,
    restaurantId: string,
    userId?: string,
  ): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, status: true },
    });

    if (!lead) return;

    if (lead.status === LeadStatus.CLIENT || lead.status === LeadStatus.LOST) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { convertedRestaurantId: restaurantId },
      });
      return;
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        status: LeadStatus.CLIENT,
        convertedRestaurantId: restaurantId,
        statusHistory: {
          create: {
            fromStatus: lead.status,
            toStatus: LeadStatus.CLIENT,
            changedById: userId,
          },
        },
      },
    });
  }
}
