import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionResolverService } from '../subscriptions/subscription-resolver.service';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import type {
  BuilderAiComposeIntent,
  BuilderAiCopyField,
  ComposeHomeDto,
  ImproveBuilderCopyDto,
} from './dto/builder-ai.dto';
import {
  normalizeComposeHomeResponse,
  normalizeImprovedCopy,
  type ComposeHomeResult,
} from './builder-ai.normalize';
import { assertComposeHomeAccessOrThrow } from './builder-ai-access';
import { HOME_PRESETS } from './types/page-doc';

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

const IMPROVE_COPY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: {
    text: { type: 'string' },
  },
} as const;

const COMPOSE_HOME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['presetId', 'blocks'],
  properties: {
    presetId: {
      type: 'string',
      enum: ['order-online', 'reserve-table', 'brand-menu', 'delivery-push'],
    },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'props'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'hero',
              'featured',
              'menu',
              'about',
              'testimonials',
              'faq',
              'info',
              'cta',
              'gallery',
              'richText',
              'hours',
              'map',
            ],
          },
          props: {
            type: 'object',
            additionalProperties: true,
            properties: {
              title: {
                type: 'object',
                properties: { text: { type: 'string' } },
              },
              subtitle: {
                type: 'object',
                properties: { text: { type: 'string' } },
              },
              body: { type: 'string' },
              buttonText: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

type RestaurantAiContext = {
  name: string;
  type?: string;
  city?: string;
  description?: string;
  cuisineTypes?: string[];
};

@Injectable()
export class BuilderAiService {
  private readonly logger = new Logger(BuilderAiService.name);
  private readonly gemini: GoogleGenAI | null;
  private readonly geminiModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly subscriptionResolver: SubscriptionResolverService,
  ) {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ||
      this.configService.get<string>('GOOGLE_API_KEY')?.trim();

    this.geminiModel =
      this.configService.get<string>('BUILDER_AI_MODEL')?.trim() ||
      this.configService.get<string>('ONBOARDING_AI_MODEL')?.trim() ||
      DEFAULT_GEMINI_MODEL;

    this.gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;
    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY not configured — builder AI endpoints will fail until set',
      );
    }
  }

  /**
   * "Armar con IA" is paid-only: ACTIVE subscription or SUPER_ADMIN.
   * Trial / unpaid accounts are blocked.
   */
  async assertComposeHomeAccess(
    restaurantId: string,
    user: RequestUser,
  ): Promise<void> {
    const subscription = await this.subscriptionResolver.resolveForRestaurant(
      restaurantId,
      {
        select: {
          status: true,
        },
      },
    );

    assertComposeHomeAccessOrThrow(user, subscription);
  }

  async improveCopy(
    restaurantId: string,
    dto: ImproveBuilderCopyDto,
  ): Promise<{ text: string }> {
    const restaurant = await this.loadRestaurantContext(restaurantId);
    const mergedContext = {
      ...restaurant,
      ...(dto.restaurantContext ?? {}),
    };

    const fallback = this.heuristicImprove(
      dto.field,
      dto.currentText,
      mergedContext,
      dto.tone,
    );

    if (!this.gemini) {
      return { text: fallback };
    }

    try {
      const response = await this.gemini.models.generateContent({
        model: this.geminiModel,
        contents: this.buildImprovePrompt(
          dto.field,
          dto.currentText,
          mergedContext,
          dto.tone,
        ),
        config: {
          systemInstruction:
            'Sos un copywriter gastronómico para Argentina (español rioplatense). ' +
            'Mejorá textos cortos para el sitio web de un restaurante. ' +
            'No inventes teléfono, dirección, horarios, precios ni datos de contacto. ' +
            'Devolvé exclusivamente JSON válido según el esquema, sin markdown.',
          temperature: 0.55,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
          responseJsonSchema: IMPROVE_COPY_SCHEMA,
        },
      });

      const raw = response.text?.trim();
      if (!raw) throw new Error('Gemini returned empty improve-copy response');
      const parsed = JSON.parse(raw) as unknown;
      return {
        text: normalizeImprovedCopy(parsed, fallback),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Builder improve-copy failed: ${message}`);
      return { text: fallback };
    }
  }

  async composeHome(
    restaurantId: string,
    dto: ComposeHomeDto,
  ): Promise<ComposeHomeResult> {
    const restaurant = await this.loadRestaurantContext(restaurantId);
    const fallback = this.heuristicCompose(dto.intent, restaurant);

    if (!this.gemini) {
      return fallback;
    }

    try {
      const response = await this.gemini.models.generateContent({
        model: this.geminiModel,
        contents: this.buildComposePrompt(dto.intent, restaurant),
        config: {
          systemInstruction:
            'Sos un diseñador de sitios para restaurantes en Argentina (español rioplatense). ' +
            'Armá copy para bloques de la home. No inventes teléfono, dirección, horarios ni emails. ' +
            'Para bloques hours/map solo sugerí títulos. ' +
            'Devolvé exclusivamente JSON válido según el esquema, sin markdown.',
          temperature: 0.5,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseJsonSchema: COMPOSE_HOME_SCHEMA,
        },
      });

      const raw = response.text?.trim();
      if (!raw) throw new Error('Gemini returned empty compose-home response');
      const parsed = JSON.parse(raw) as unknown;
      return normalizeComposeHomeResponse(dto.intent, parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Builder compose-home failed: ${message}`);
      return fallback;
    }
  }

  private async loadRestaurantContext(
    restaurantId: string,
  ): Promise<RestaurantAiContext> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        type: true,
        city: true,
        description: true,
        cuisineTypes: true,
      },
    });

    return {
      name: restaurant?.name?.trim() || 'Tu local',
      type: restaurant?.type ?? undefined,
      city: restaurant?.city ?? undefined,
      description: restaurant?.description ?? undefined,
      cuisineTypes: restaurant?.cuisineTypes ?? undefined,
    };
  }

  private buildImprovePrompt(
    field: BuilderAiCopyField,
    currentText: string | undefined,
    ctx: RestaurantAiContext,
    tone?: string,
  ): string {
    return [
      'Mejorá el siguiente texto de un sitio de restaurante.',
      `Campo: ${field}`,
      `Local: ${ctx.name}`,
      ctx.type ? `Tipo: ${ctx.type}` : '',
      ctx.city ? `Ciudad: ${ctx.city}` : '',
      ctx.description ? `Descripción: ${ctx.description}` : '',
      tone ? `Tono: ${tone}` : 'Tono: cercano y claro',
      '',
      'Texto actual (puede estar vacío):',
      currentText?.trim() || '(vacío — inventá un texto corto y natural)',
      '',
      'Reglas: una sola frase o dos cortas; sin emojis; sin inventar datos de contacto.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildComposePrompt(
    intent: BuilderAiComposeIntent,
    ctx: RestaurantAiContext,
  ): string {
    const preset = HOME_PRESETS.find((p) => p.id === intent);
    const types = preset?.blocks.join(', ') ?? intent;
    return [
      `Armá el copy de la home con intención "${intent}" (${preset?.label ?? intent}).`,
      `Bloques en orden (mismo orden en la respuesta): ${types}`,
      `Local: ${ctx.name}`,
      ctx.type ? `Tipo: ${ctx.type}` : '',
      ctx.city ? `Ciudad: ${ctx.city}` : '',
      ctx.description ? `Descripción: ${ctx.description}` : '',
      ctx.cuisineTypes?.length ? `Cocina: ${ctx.cuisineTypes.join(', ')}` : '',
      '',
      'Para cada bloque devolvé type + props con title.text / subtitle.text / body / buttonText según corresponda.',
      'No inventes horarios, teléfono ni dirección.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private heuristicImprove(
    field: BuilderAiCopyField,
    currentText: string | undefined,
    ctx: RestaurantAiContext,
    tone?: string,
  ): string {
    const name = ctx.name;
    const city = ctx.city ? ` en ${ctx.city}` : '';
    const trimmed = currentText?.trim();
    if (trimmed && trimmed.length > 8) {
      return trimmed.endsWith('.') || trimmed.endsWith('!')
        ? trimmed
        : `${trimmed}.`;
    }

    const urgent = tone?.toLowerCase().includes('urgent');
    switch (field) {
      case 'hero.title':
        return name;
      case 'hero.subtitle':
        return urgent
          ? `Pedí online${city} y listo en minutos.`
          : `Comé rico${city}, sin vueltas.`;
      case 'hero.cta':
      case 'cta.button':
      case 'block.cta':
        return 'Ver menú';
      case 'cta.title':
        return 'Pedí online';
      case 'cta.subtitle':
        return 'Retiro o delivery cuando quieras.';
      case 'about.title':
      case 'block.title':
        return 'Nuestra historia';
      case 'about.body':
      case 'richText.body':
      case 'block.body':
        return (
          ctx.description?.trim() ||
          `${name} es un lugar para disfrutar buena comida${city}.`
        );
      case 'featured.title':
        return 'Los favoritos de la casa';
      case 'testimonials.title':
        return 'Lo que dicen nuestros clientes';
      case 'faq.title':
        return 'Preguntas frecuentes';
      case 'gallery.title':
        return 'Galería';
      case 'hours.title':
        return 'Horarios';
      case 'map.title':
        return 'Cómo llegar';
      case 'richText.title':
        return 'Más información';
      case 'block.subtitle':
        return `Te esperamos${city}.`;
      default: {
        const _exhaustive: never = field;
        return String(_exhaustive);
      }
    }
  }

  private heuristicCompose(
    intent: BuilderAiComposeIntent,
    ctx: RestaurantAiContext,
  ): ComposeHomeResult {
    const name = ctx.name;
    const city = ctx.city ? ` en ${ctx.city}` : '';
    const rawBlocks = (() => {
      switch (intent) {
        case 'order-online':
          return [
            {
              type: 'hero',
              props: {
                title: { text: name },
                subtitle: { text: `Pedí online${city} en minutos.` },
                buttonText: 'Ver menú',
              },
            },
            {
              type: 'featured',
              props: { title: { text: 'Los más pedidos' } },
            },
            { type: 'menu', props: {} },
            {
              type: 'cta',
              props: {
                title: { text: '¿Con hambre?' },
                subtitle: { text: 'Armá tu pedido ahora.' },
                buttonText: 'Pedir',
              },
            },
            { type: 'info', props: {} },
          ];
        case 'reserve-table':
          return [
            {
              type: 'hero',
              props: {
                title: { text: name },
                subtitle: { text: `Reservá tu mesa${city}.` },
                buttonText: 'Reservar',
              },
            },
            {
              type: 'about',
              props: {
                title: { text: 'Nuestra historia' },
                body:
                  ctx.description?.trim() ||
                  `Un lugar para compartir buena comida${city}.`,
              },
            },
            { type: 'hours', props: { title: { text: 'Horarios' } } },
            { type: 'map', props: { title: { text: 'Cómo llegar' } } },
            { type: 'info', props: {} },
            {
              type: 'faq',
              props: { title: { text: 'Antes de venir' } },
            },
          ];
        case 'brand-menu':
          return [
            {
              type: 'hero',
              props: {
                title: { text: name },
                subtitle: { text: 'Nuestra cocina, nuestra marca.' },
                buttonText: 'Explorar menú',
              },
            },
            {
              type: 'about',
              props: {
                title: { text: 'Quiénes somos' },
                body:
                  ctx.description?.trim() ||
                  `${name}: sabor y atención de verdad.`,
              },
            },
            { type: 'menu', props: {} },
            {
              type: 'testimonials',
              props: { title: { text: 'Lo que dicen' } },
            },
            { type: 'gallery', props: { title: { text: 'Ambiente' } } },
            { type: 'info', props: {} },
          ];
        case 'delivery-push':
          return [
            {
              type: 'hero',
              props: {
                title: { text: `${name} a domicilio` },
                subtitle: { text: `Delivery${city} rápido y caliente.` },
                buttonText: 'Pedir delivery',
              },
            },
            {
              type: 'cta',
              props: {
                title: { text: 'Pedí ya' },
                subtitle: { text: 'Tu pedido en camino.' },
                buttonText: 'Ir al menú',
              },
            },
            { type: 'menu', props: {} },
            {
              type: 'featured',
              props: { title: { text: 'Lo más pedido en delivery' } },
            },
            {
              type: 'faq',
              props: { title: { text: 'Envíos y demoras' } },
            },
            {
              type: 'cta',
              props: {
                title: { text: '¿Todavía no pediste?' },
                subtitle: { text: 'Estamos listos para cocinar.' },
                buttonText: 'Pedir ahora',
              },
            },
            { type: 'info', props: {} },
          ];
        default: {
          const _exhaustive: never = intent;
          return [
            { type: 'hero', props: { title: { text: String(_exhaustive) } } },
          ];
        }
      }
    })();

    return normalizeComposeHomeResponse(intent, {
      presetId: intent,
      blocks: rawBlocks,
    });
  }
}
