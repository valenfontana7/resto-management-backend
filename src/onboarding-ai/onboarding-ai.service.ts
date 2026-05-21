import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GenerateOnboardingDraftDto } from './dto/generate-onboarding-draft.dto';
import {
  OnboardingAiBuilderDraft,
  OnboardingAiBusinessType,
  OnboardingAiCategoryDraft,
  OnboardingAiDaySchedule,
  OnboardingAiDraft,
  OnboardingAiHours,
} from './types/onboarding-ai.types';

type Palette = {
  primary: string;
  secondary: string;
  accent: string;
};

type CuisineMatch = {
  id: string;
  keywords: string[];
};

const CUISINE_MATCHERS: CuisineMatch[] = [
  { id: 'argentina', keywords: ['argentina', 'argentino', 'criolla'] },
  { id: 'italiana', keywords: ['italiana', 'italiano', 'pasta'] },
  { id: 'mexicana', keywords: ['mexicana', 'tacos', 'burrito'] },
  { id: 'japonesa', keywords: ['japonesa', 'sushi', 'ramen'] },
  { id: 'china', keywords: ['china', 'wok', 'dimsum'] },
  { id: 'peruana', keywords: ['peruana', 'ceviche'] },
  { id: 'vegetariana', keywords: ['vegetariana', 'vegetariano'] },
  { id: 'vegana', keywords: ['vegana', 'vegano'] },
  { id: 'pizza', keywords: ['pizza', 'pizzeria', 'pizzera'] },
  { id: 'hamburguesas', keywords: ['hamburguesa', 'burger'] },
  { id: 'parrilla', keywords: ['parrilla', 'asado'] },
  { id: 'mariscos', keywords: ['mariscos', 'pescados', 'frutos del mar'] },
  { id: 'comida-rapida', keywords: ['comida rapida', 'fast food'] },
  { id: 'saludable', keywords: ['saludable', 'healthy'] },
  { id: 'fusion', keywords: ['fusion'] },
  { id: 'española', keywords: ['espanola', 'española', 'tapas', 'paella'] },
];

const CATEGORY_SUGGESTIONS: Record<
  string,
  Array<{ name: string; description: string }>
> = {
  pizza: [
    {
      name: 'Pizzas clasicas',
      description: 'Las variedades que mejor representan la casa.',
    },
    {
      name: 'Especiales',
      description: 'Combinaciones de autor y sabores diferenciales.',
    },
    {
      name: 'Entradas',
      description: 'Opciones para compartir antes del plato principal.',
    },
    {
      name: 'Postres',
      description: 'Cierre dulce para completar la experiencia.',
    },
  ],
  hamburguesas: [
    {
      name: 'Burgers clasicas',
      description: 'Las hamburguesas base del menu.',
    },
    {
      name: 'Burgers premium',
      description: 'Versiones con toppings y combinaciones especiales.',
    },
    {
      name: 'Acompanamientos',
      description: 'Papas, dips y extras para sumar al pedido.',
    },
    { name: 'Bebidas', description: 'Gaseosas, aguas y otras opciones frias.' },
  ],
  cafe: [
    {
      name: 'Cafe de especialidad',
      description: 'Bebidas calientes con foco en calidad y sabor.',
    },
    {
      name: 'Pasteleria',
      description: 'Medialunas, tortas y piezas dulces para acompanar.',
    },
    {
      name: 'Desayunos y meriendas',
      description: 'Combos pensados para distintos momentos del dia.',
    },
    {
      name: 'Bebidas frias',
      description: 'Jugos, limonadas y opciones refrescantes.',
    },
  ],
  bakery: [
    { name: 'Panaderia', description: 'Panes y piezas recien horneadas.' },
    { name: 'Pasteleria', description: 'Tortas, facturas y dulces del dia.' },
    {
      name: 'Sandwiches',
      description: 'Opciones listas para takeaway o consumo rapido.',
    },
    {
      name: 'Bebidas',
      description: 'Cafe, te y otras bebidas para complementar.',
    },
  ],
  parrilla: [
    {
      name: 'Entradas',
      description: 'Picadas, provoletas y platos para abrir el apetito.',
    },
    {
      name: 'Parrilla',
      description: 'Cortes principales y especialidades a las brasas.',
    },
    {
      name: 'Guarniciones',
      description: 'Acompanamientos tradicionales y extras.',
    },
    { name: 'Postres', description: 'Clasicos de cierre para la sobremesa.' },
  ],
};

const PALETTES: Record<string, Palette> = {
  pizza: { primary: '#b91c1c', secondary: '#f97316', accent: '#facc15' },
  hamburguesas: { primary: '#92400e', secondary: '#f59e0b', accent: '#ef4444' },
  parrilla: { primary: '#7f1d1d', secondary: '#b45309', accent: '#fb7185' },
  italiana: { primary: '#166534', secondary: '#dc2626', accent: '#f59e0b' },
  japonesa: { primary: '#0f172a', secondary: '#1d4ed8', accent: '#f43f5e' },
  mexicana: { primary: '#15803d', secondary: '#dc2626', accent: '#f59e0b' },
  cafe: { primary: '#854d0e', secondary: '#a16207', accent: '#0f766e' },
  bakery: { primary: '#c2410c', secondary: '#ea580c', accent: '#d97706' },
  other: { primary: '#0f766e', secondary: '#0891b2', accent: '#10b981' },
};

const DEFAULT_COUNTRY = 'Argentina';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';
const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_PAYMENT_METHODS = new Set([
  'cash',
  'debit-card',
  'credit-card',
  'digital-wallet',
  'bank-transfer',
]);
const VALID_BUSINESS_TYPES = new Set<OnboardingAiBusinessType>([
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'food-truck',
  'other',
]);
const TIME_RANGE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['openTime', 'closeTime'],
  properties: {
    openTime: {
      type: 'string',
      description: 'Horario de apertura en formato HH:MM de 24 horas.',
    },
    closeTime: {
      type: 'string',
      description: 'Horario de cierre en formato HH:MM de 24 horas.',
    },
  },
} as const;
const DAY_SCHEDULE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isOpen', 'timeRanges'],
  properties: {
    isOpen: {
      type: 'boolean',
      description: 'Indica si el negocio abre ese dia.',
    },
    timeRanges: {
      type: 'array',
      maxItems: 3,
      items: TIME_RANGE_JSON_SCHEMA,
    },
  },
} as const;
const ONBOARDING_AI_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'businessInfo',
    'contact',
    'hours',
    'menuSetup',
    'paymentMethods',
    'deliveryZones',
    'builderDraft',
    'assumptions',
  ],
  properties: {
    businessInfo: {
      type: 'object',
      additionalProperties: false,
      required: ['restaurantName', 'businessType', 'cuisine', 'description'],
      properties: {
        restaurantName: { type: 'string' },
        businessType: {
          type: 'string',
          enum: ['restaurant', 'cafe', 'bar', 'bakery', 'food-truck', 'other'],
        },
        cuisine: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string' },
        },
        description: { type: 'string' },
      },
    },
    contact: {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'phone', 'address', 'city', 'country', 'postalCode'],
      properties: {
        email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'string' },
        postalCode: { type: 'string' },
      },
    },
    hours: {
      type: 'object',
      additionalProperties: false,
      required: [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ],
      properties: {
        monday: DAY_SCHEDULE_JSON_SCHEMA,
        tuesday: DAY_SCHEDULE_JSON_SCHEMA,
        wednesday: DAY_SCHEDULE_JSON_SCHEMA,
        thursday: DAY_SCHEDULE_JSON_SCHEMA,
        friday: DAY_SCHEDULE_JSON_SCHEMA,
        saturday: DAY_SCHEDULE_JSON_SCHEMA,
        sunday: DAY_SCHEDULE_JSON_SCHEMA,
      },
    },
    menuSetup: {
      type: 'object',
      additionalProperties: false,
      required: ['setupMethod', 'categories', 'estimatedDishes'],
      properties: {
        setupMethod: {
          type: 'string',
          enum: ['scratch'],
        },
        categories: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'name', 'description'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        estimatedDishes: { type: 'integer', minimum: 0 },
      },
    },
    paymentMethods: {
      type: 'object',
      additionalProperties: false,
      required: [
        'enabledMethods',
        'requirePrepayment',
        'acceptTips',
        'tipPercentages',
      ],
      properties: {
        enabledMethods: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'cash',
              'debit-card',
              'credit-card',
              'digital-wallet',
              'bank-transfer',
            ],
          },
        },
        requirePrepayment: { type: 'boolean' },
        acceptTips: { type: 'boolean' },
        tipPercentages: {
          type: 'array',
          maxItems: 4,
          items: { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
    },
    deliveryZones: {
      type: 'object',
      additionalProperties: false,
      required: ['enabled', 'zones'],
      properties: {
        enabled: { type: 'boolean' },
        zones: {
          type: 'array',
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'id',
              'name',
              'deliveryFee',
              'minOrder',
              'estimatedTime',
              'areas',
            ],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              deliveryFee: { type: 'integer', minimum: 0 },
              minOrder: { type: 'integer', minimum: 0 },
              estimatedTime: { type: 'string' },
              areas: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
        freeDeliveryThreshold: {
          type: ['integer', 'null'],
          minimum: 0,
        },
        estimatedTime: {
          type: ['string', 'null'],
        },
      },
    },
    builderDraft: {
      type: 'object',
      additionalProperties: false,
      required: ['restaurant', 'theme', 'sections'],
      properties: {
        restaurant: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'description',
            'cuisineTypes',
            'type',
            'address',
            'city',
            'country',
            'postalCode',
            'phone',
            'email',
          ],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            cuisineTypes: {
              type: 'array',
              items: { type: 'string' },
            },
            type: { type: 'string' },
            address: { type: 'string' },
            city: { type: 'string' },
            country: { type: 'string' },
            postalCode: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
          },
        },
        theme: {
          type: 'object',
          additionalProperties: false,
          required: ['colors'],
          properties: {
            colors: {
              type: 'object',
              additionalProperties: false,
              required: ['primary', 'secondary', 'accent'],
              properties: {
                primary: { type: 'string' },
                secondary: { type: 'string' },
                accent: { type: 'string' },
              },
            },
          },
        },
        sections: {
          type: 'object',
          additionalProperties: false,
          required: ['hero'],
          properties: {
            hero: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'description'],
              properties: {
                title: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['text'],
                  properties: {
                    text: { type: 'string' },
                  },
                },
                description: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['text'],
                  properties: {
                    text: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    assumptions: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string' },
    },
  },
} as const;

@Injectable()
export class OnboardingAiService {
  private readonly logger = new Logger(OnboardingAiService.name);
  private readonly gemini: GoogleGenAI | null;
  private readonly geminiModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ||
      this.configService.get<string>('GOOGLE_API_KEY')?.trim();

    this.geminiModel =
      this.configService.get<string>('ONBOARDING_AI_MODEL')?.trim() ||
      DEFAULT_GEMINI_MODEL;

    if (apiKey) {
      this.gemini = new GoogleGenAI({ apiKey });
      return;
    }

    this.gemini = null;
    this.logger.warn(
      'GEMINI_API_KEY not configured - onboarding AI will use heuristic draft generation',
    );
  }

  async generateDraft({
    prompt,
  }: GenerateOnboardingDraftDto): Promise<OnboardingAiDraft> {
    const fallbackDraft = this.buildHeuristicDraft(prompt);

    if (!this.gemini) {
      return fallbackDraft;
    }

    try {
      const response = await this.gemini.models.generateContent({
        model: this.geminiModel,
        contents: this.buildGeminiPrompt(prompt),
        config: {
          systemInstruction:
            'Sos un asistente de onboarding para restaurantes. Devolve exclusivamente JSON valido que cumpla el esquema, sin markdown ni texto extra. Usa espanol claro, sin espanglish. Si falta un dato, usa string vacio, array vacio o false segun corresponda. Usa horarios HH:MM en formato de 24 horas y colores hex #RRGGBB.',
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseJsonSchema: ONBOARDING_AI_RESPONSE_JSON_SCHEMA,
        },
      });

      const rawDraft = response.text?.trim();
      if (!rawDraft) {
        throw new Error('Gemini returned an empty response');
      }

      const parsedDraft = JSON.parse(rawDraft) as Partial<OnboardingAiDraft>;
      return this.normalizeDraft(parsedDraft, fallbackDraft);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Gemini onboarding draft generation failed: ${message}`,
      );
      return fallbackDraft;
    }
  }

  private buildHeuristicDraft(prompt: string): OnboardingAiDraft {
    const normalizedPrompt = this.normalizePrompt(prompt);
    const assumptions: string[] = [];
    const businessType = this.detectBusinessType(normalizedPrompt);
    const cuisines = this.detectCuisines(normalizedPrompt, businessType);
    const restaurantName = this.extractRestaurantName(prompt, businessType);
    const email = this.extractEmail(normalizedPrompt);
    const phone = this.extractPhone(normalizedPrompt);
    const address = this.extractAddress(prompt);
    const city = this.extractCity(prompt);
    const postalCode = this.extractPostalCode(normalizedPrompt);

    if (!email) {
      assumptions.push('No se detecto un email. Completar contacto comercial.');
    }

    if (!phone) {
      assumptions.push(
        'No se detecto un telefono. Revisar canal principal de contacto.',
      );
    }

    if (!address) {
      assumptions.push(
        'No se detecto una direccion completa. Ajustar ubicacion antes de publicar.',
      );
    }

    if (!city) {
      assumptions.push(
        'No se detecto ciudad. Se dejo pendiente para completar manualmente.',
      );
    }

    const hours = this.buildHours(businessType, normalizedPrompt, assumptions);
    const categories = this.buildCategories(cuisines, businessType);
    const estimatedDishes =
      this.extractEstimatedDishes(normalizedPrompt) ?? categories.length * 6;
    const deliveryZones = this.buildDeliveryZones(
      normalizedPrompt,
      assumptions,
    );
    const paymentMethods = this.buildPaymentMethods(
      normalizedPrompt,
      assumptions,
    );
    const description = this.buildDescription({
      restaurantName,
      businessType,
      cuisines,
    });

    return {
      businessInfo: {
        restaurantName,
        businessType,
        cuisine: cuisines,
        description,
      },
      contact: {
        email,
        phone,
        address,
        city,
        country: DEFAULT_COUNTRY,
        postalCode,
      },
      hours,
      menuSetup: {
        setupMethod: 'scratch',
        categories,
        estimatedDishes,
      },
      paymentMethods,
      deliveryZones,
      builderDraft: this.buildBuilderDraft({
        restaurantName,
        businessType,
        cuisines,
        description,
        address,
        city,
        email,
        phone,
        postalCode,
      }),
      assumptions,
    };
  }

  private buildGeminiPrompt(prompt: string): string {
    return [
      'Analiza la descripcion de un negocio gastronomico y genera un borrador de onboarding completo.',
      'Reglas:',
      '- businessType solo puede ser: restaurant, cafe, bar, bakery, food-truck u other.',
      '- menuSetup.setupMethod siempre debe ser scratch.',
      '- paymentMethods.enabledMethods solo puede incluir: cash, debit-card, credit-card, digital-wallet, bank-transfer.',
      '- cuisine y builderDraft.restaurant.cuisineTypes deben ser etiquetas cortas tipo slug en minusculas, por ejemplo argentina, pizza, hamburguesas o comida-rapida.',
      '- Si no hay evidencia clara de delivery, dejar deliveryZones.enabled en false y zones vacio.',
      '- assumptions debe listar solo supuestos reales o datos faltantes, en espanol.',
      '- builderDraft debe estar alineado con la informacion del negocio y el copy debe sonar natural para una marca gastronomica.',
      '',
      'Descripcion original del usuario:',
      prompt,
    ].join('\n');
  }

  private normalizeDraft(
    draft: Partial<OnboardingAiDraft>,
    fallback: OnboardingAiDraft,
  ): OnboardingAiDraft {
    const businessInfo = {
      restaurantName: this.normalizeString(
        draft.businessInfo?.restaurantName,
        fallback.businessInfo.restaurantName,
      ),
      businessType: this.normalizeBusinessType(
        draft.businessInfo?.businessType,
        fallback.businessInfo.businessType,
      ),
      cuisine: this.normalizeCuisineIds(
        draft.businessInfo?.cuisine,
        fallback.businessInfo.cuisine,
      ),
      description: this.normalizeString(
        draft.businessInfo?.description,
        fallback.businessInfo.description,
      ),
    };

    const contact = {
      email: this.normalizeString(draft.contact?.email, fallback.contact.email),
      phone: this.normalizeString(draft.contact?.phone, fallback.contact.phone),
      address: this.normalizeString(
        draft.contact?.address,
        fallback.contact.address,
      ),
      city: this.normalizeString(draft.contact?.city, fallback.contact.city),
      country: this.normalizeString(
        draft.contact?.country,
        fallback.contact.country || DEFAULT_COUNTRY,
      ),
      postalCode: this.normalizeString(
        draft.contact?.postalCode,
        fallback.contact.postalCode,
      ),
    };

    const deliveryEnabled = this.pickBoolean(
      draft.deliveryZones?.enabled,
      fallback.deliveryZones.enabled,
    );

    return {
      businessInfo,
      contact,
      hours: this.normalizeHours(draft.hours, fallback.hours),
      menuSetup: {
        setupMethod: 'scratch',
        categories: this.normalizeCategories(
          draft.menuSetup?.categories,
          fallback.menuSetup.categories,
        ),
        estimatedDishes: this.normalizePositiveInteger(
          draft.menuSetup?.estimatedDishes,
          fallback.menuSetup.estimatedDishes,
        ),
      },
      paymentMethods: {
        enabledMethods: this.normalizePaymentMethods(
          draft.paymentMethods?.enabledMethods,
          fallback.paymentMethods.enabledMethods,
        ),
        requirePrepayment: this.pickBoolean(
          draft.paymentMethods?.requirePrepayment,
          fallback.paymentMethods.requirePrepayment,
        ),
        acceptTips: this.pickBoolean(
          draft.paymentMethods?.acceptTips,
          fallback.paymentMethods.acceptTips,
        ),
        tipPercentages: this.normalizePositiveIntegerArray(
          draft.paymentMethods?.tipPercentages,
          fallback.paymentMethods.tipPercentages,
          4,
        ),
      },
      deliveryZones: {
        enabled: deliveryEnabled,
        zones: deliveryEnabled
          ? this.normalizeDeliveryZones(
              draft.deliveryZones?.zones,
              fallback.deliveryZones.zones,
            )
          : [],
        freeDeliveryThreshold: deliveryEnabled
          ? this.normalizePositiveInteger(
              draft.deliveryZones?.freeDeliveryThreshold,
              fallback.deliveryZones.freeDeliveryThreshold,
            )
          : undefined,
        estimatedTime: deliveryEnabled
          ? this.normalizeOptionalString(
              draft.deliveryZones?.estimatedTime,
              fallback.deliveryZones.estimatedTime,
            )
          : undefined,
      },
      builderDraft: this.normalizeBuilderDraft(
        draft.builderDraft,
        fallback.builderDraft,
        businessInfo,
        contact,
      ),
      assumptions: this.normalizeAssumptions(
        draft.assumptions,
        fallback.assumptions,
      ),
    };
  }

  private normalizeBuilderDraft(
    draft: Partial<OnboardingAiBuilderDraft> | undefined,
    fallback: OnboardingAiBuilderDraft | undefined,
    businessInfo: OnboardingAiDraft['businessInfo'],
    contact: OnboardingAiDraft['contact'],
  ): OnboardingAiBuilderDraft {
    const baseDraft =
      fallback ??
      this.buildBuilderDraft({
        restaurantName: businessInfo.restaurantName,
        businessType: businessInfo.businessType,
        cuisines: businessInfo.cuisine,
        description: businessInfo.description,
        address: contact.address,
        city: contact.city,
        email: contact.email,
        phone: contact.phone,
        postalCode: contact.postalCode,
      });

    return {
      restaurant: {
        name: this.normalizeString(
          draft?.restaurant?.name,
          baseDraft.restaurant?.name ?? businessInfo.restaurantName,
        ),
        description: this.normalizeString(
          draft?.restaurant?.description,
          baseDraft.restaurant?.description ?? businessInfo.description,
        ),
        cuisineTypes: this.normalizeCuisineIds(
          draft?.restaurant?.cuisineTypes,
          baseDraft.restaurant?.cuisineTypes ?? businessInfo.cuisine,
        ),
        type: this.normalizeBusinessType(
          draft?.restaurant?.type,
          businessInfo.businessType,
        ),
        address: this.normalizeString(
          draft?.restaurant?.address,
          baseDraft.restaurant?.address ?? contact.address,
        ),
        city: this.normalizeString(
          draft?.restaurant?.city,
          baseDraft.restaurant?.city ?? contact.city,
        ),
        country: this.normalizeString(
          draft?.restaurant?.country,
          baseDraft.restaurant?.country ?? contact.country,
        ),
        postalCode: this.normalizeString(
          draft?.restaurant?.postalCode,
          baseDraft.restaurant?.postalCode ?? contact.postalCode,
        ),
        phone: this.normalizeString(
          draft?.restaurant?.phone,
          baseDraft.restaurant?.phone ?? contact.phone,
        ),
        email: this.normalizeString(
          draft?.restaurant?.email,
          baseDraft.restaurant?.email ?? contact.email,
        ),
      },
      theme: {
        colors: {
          primary: this.normalizeHexColor(
            draft?.theme?.colors?.primary,
            baseDraft.theme?.colors?.primary ?? PALETTES.other.primary,
          ),
          secondary: this.normalizeHexColor(
            draft?.theme?.colors?.secondary,
            baseDraft.theme?.colors?.secondary ?? PALETTES.other.secondary,
          ),
          accent: this.normalizeHexColor(
            draft?.theme?.colors?.accent,
            baseDraft.theme?.colors?.accent ?? PALETTES.other.accent,
          ),
        },
      },
      sections: {
        hero: {
          title: {
            text: this.normalizeString(
              draft?.sections?.hero?.title?.text,
              baseDraft.sections?.hero?.title?.text ??
                businessInfo.restaurantName,
            ),
          },
          description: {
            text: this.normalizeString(
              draft?.sections?.hero?.description?.text,
              baseDraft.sections?.hero?.description?.text ??
                businessInfo.description,
            ),
          },
        },
      },
    };
  }

  private normalizeHours(
    hours: Partial<OnboardingAiHours> | undefined,
    fallback: OnboardingAiHours,
  ): OnboardingAiHours {
    const dayKeys: Array<keyof OnboardingAiHours> = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];

    return dayKeys.reduce<OnboardingAiHours>((result, dayKey) => {
      result[dayKey] = this.normalizeDaySchedule(
        hours?.[dayKey],
        fallback[dayKey],
      );
      return result;
    }, {} as OnboardingAiHours);
  }

  private normalizeDaySchedule(
    schedule: Partial<OnboardingAiDaySchedule> | undefined,
    fallback: OnboardingAiDaySchedule,
  ): OnboardingAiDaySchedule {
    const isOpen = this.pickBoolean(schedule?.isOpen, fallback.isOpen);
    if (!isOpen) {
      return {
        isOpen: false,
        timeRanges: [],
      };
    }

    return {
      isOpen: true,
      timeRanges: this.normalizeTimeRanges(
        schedule?.timeRanges,
        fallback.timeRanges,
      ),
    };
  }

  private normalizeTimeRanges(
    timeRanges: OnboardingAiDaySchedule['timeRanges'] | undefined,
    fallback: OnboardingAiDaySchedule['timeRanges'],
  ): OnboardingAiDaySchedule['timeRanges'] {
    if (!Array.isArray(timeRanges)) {
      return fallback;
    }

    const normalizedRanges = timeRanges
      .map((timeRange) => {
        const openTime = this.normalizeTime(timeRange?.openTime);
        const closeTime = this.normalizeTime(timeRange?.closeTime);
        if (!openTime || !closeTime || openTime === closeTime) {
          return null;
        }

        return { openTime, closeTime };
      })
      .filter(
        (timeRange): timeRange is { openTime: string; closeTime: string } => {
          return timeRange !== null;
        },
      )
      .slice(0, 3);

    return normalizedRanges.length > 0 ? normalizedRanges : fallback;
  }

  private normalizeCategories(
    categories: OnboardingAiCategoryDraft[] | undefined,
    fallback: OnboardingAiCategoryDraft[],
  ): OnboardingAiCategoryDraft[] {
    if (!Array.isArray(categories)) {
      return fallback;
    }

    const normalizedCategories = categories
      .map((category, index) => {
        const name = this.normalizeString(category?.name, '');
        if (!name) {
          return null;
        }

        return {
          id: `ai-category-${index + 1}`,
          name,
          description: this.normalizeString(
            category?.description,
            `Opciones destacadas de ${name}.`,
          ),
        };
      })
      .filter(
        (category): category is OnboardingAiCategoryDraft => category !== null,
      )
      .slice(0, 6);

    return normalizedCategories.length > 0 ? normalizedCategories : fallback;
  }

  private normalizeDeliveryZones(
    zones: OnboardingAiDraft['deliveryZones']['zones'] | undefined,
    fallback: OnboardingAiDraft['deliveryZones']['zones'],
  ): OnboardingAiDraft['deliveryZones']['zones'] {
    if (!Array.isArray(zones)) {
      return fallback;
    }

    const normalizedZones = zones
      .map((zone, index) => {
        const name = this.normalizeString(zone?.name, '');
        if (!name) {
          return null;
        }

        return {
          id: `ai-zone-${index + 1}`,
          name,
          deliveryFee: this.normalizePositiveInteger(zone?.deliveryFee, 0) ?? 0,
          minOrder: this.normalizePositiveInteger(zone?.minOrder, 0) ?? 0,
          estimatedTime: this.normalizeString(zone?.estimatedTime, '30-45 min'),
          areas: this.normalizeStringArray(zone?.areas, [], 8),
        };
      })
      .filter(
        (zone): zone is OnboardingAiDraft['deliveryZones']['zones'][number] =>
          zone !== null,
      )
      .slice(0, 4);

    return normalizedZones.length > 0 ? normalizedZones : fallback;
  }

  private normalizeAssumptions(
    assumptions: string[] | undefined,
    fallback: string[],
  ): string[] {
    if (!Array.isArray(assumptions)) {
      return fallback;
    }

    const normalizedAssumptions = [
      ...new Set(
        assumptions
          .map((assumption) => this.normalizeString(assumption, ''))
          .filter(Boolean),
      ),
    ].slice(0, 10);

    return normalizedAssumptions.length > 0 ? normalizedAssumptions : fallback;
  }

  private normalizePaymentMethods(
    methods: string[] | undefined,
    fallback: string[],
  ): string[] {
    if (!Array.isArray(methods)) {
      return fallback;
    }

    const normalizedMethods = [
      ...new Set(
        methods.filter(
          (method): method is string =>
            typeof method === 'string' && VALID_PAYMENT_METHODS.has(method),
        ),
      ),
    ];

    return normalizedMethods.length > 0 ? normalizedMethods : fallback;
  }

  private normalizeCuisineIds(
    cuisines: string[] | undefined,
    fallback: string[],
  ): string[] {
    if (!Array.isArray(cuisines)) {
      return fallback;
    }

    const normalizedCuisines = [
      ...new Set(
        cuisines
          .filter((cuisine): cuisine is string => typeof cuisine === 'string')
          .map((cuisine) => this.toSlug(cuisine))
          .filter(Boolean),
      ),
    ].slice(0, 3);

    return normalizedCuisines.length > 0 ? normalizedCuisines : fallback;
  }

  private normalizePositiveIntegerArray(
    values: number[] | undefined,
    fallback: number[],
    maxItems: number,
  ): number[] {
    if (!Array.isArray(values)) {
      return fallback;
    }

    const normalizedValues = [
      ...new Set(
        values.filter(
          (value): value is number =>
            typeof value === 'number' && Number.isInteger(value) && value >= 0,
        ),
      ),
    ].slice(0, maxItems);

    return normalizedValues.length > 0 ? normalizedValues : fallback;
  }

  private normalizeStringArray(
    values: string[] | undefined,
    fallback: string[],
    maxItems: number,
  ): string[] {
    if (!Array.isArray(values)) {
      return fallback;
    }

    const normalizedValues = [
      ...new Set(
        values
          .filter((value): value is string => typeof value === 'string')
          .map((value) => this.normalizeString(value, ''))
          .filter(Boolean),
      ),
    ].slice(0, maxItems);

    return normalizedValues.length > 0 ? normalizedValues : fallback;
  }

  private normalizeBusinessType(
    value: string | undefined,
    fallback: OnboardingAiBusinessType,
  ): OnboardingAiBusinessType {
    if (value && VALID_BUSINESS_TYPES.has(value as OnboardingAiBusinessType)) {
      return value as OnboardingAiBusinessType;
    }

    return fallback;
  }

  private normalizeHexColor(
    value: string | undefined,
    fallback: string,
  ): string {
    if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())) {
      return value.trim();
    }

    return fallback;
  }

  private normalizeOptionalString(
    value: string | undefined,
    fallback?: string,
  ): string | undefined {
    const normalized = this.normalizeString(value, fallback ?? '');
    return normalized || undefined;
  }

  private normalizeString(value: string | undefined, fallback: string): string {
    if (typeof value !== 'string') {
      return fallback;
    }

    const normalizedValue = value.trim().replace(/\s+/g, ' ');
    return normalizedValue || fallback;
  }

  private normalizePositiveInteger(
    value: number | null | undefined,
    fallback?: number,
  ): number | undefined {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }

    return fallback;
  }

  private normalizeTime(value: string | undefined): string {
    if (typeof value !== 'string') {
      return '';
    }

    const normalizedValue = value.trim();
    return TIME_24H_PATTERN.test(normalizedValue) ? normalizedValue : '';
  }

  private pickBoolean(value: boolean | undefined, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private normalizePrompt(prompt: string): string {
    return prompt
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  private detectBusinessType(prompt: string): OnboardingAiBusinessType {
    if (prompt.includes('cafeteria') || prompt.includes('cafe')) return 'cafe';
    if (
      prompt.includes('bar') ||
      prompt.includes('pub') ||
      prompt.includes('cerveceria')
    ) {
      return 'bar';
    }
    if (prompt.includes('panaderia') || prompt.includes('pasteleria'))
      return 'bakery';
    if (prompt.includes('food truck') || prompt.includes('truck'))
      return 'food-truck';
    if (prompt.includes('restaurant') || prompt.includes('restaurante'))
      return 'restaurant';
    return 'restaurant';
  }

  private detectCuisines(
    prompt: string,
    businessType: OnboardingAiBusinessType,
  ): string[] {
    const matches = CUISINE_MATCHERS.filter(({ keywords }) =>
      keywords.some((keyword) => prompt.includes(keyword)),
    ).map(({ id }) => id);

    if (matches.length > 0) {
      return matches.slice(0, 3);
    }

    if (businessType === 'cafe') return ['saludable'];
    if (businessType === 'bakery') return ['fusion'];
    return ['argentina'];
  }

  private extractRestaurantName(
    prompt: string,
    businessType: OnboardingAiBusinessType,
  ): string {
    const quotedMatch = prompt.match(/["“](.{2,50}?)["”]/);
    if (quotedMatch?.[1]) {
      return this.toDisplayName(quotedMatch[1]);
    }

    const namedMatch = prompt.match(
      /(?:se llama|llamado|llamada|nombre es|somos)\s+([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ'&.\- ]{3,50})/i,
    );
    if (namedMatch?.[1]) {
      return this.toDisplayName(namedMatch[1].split(/[,.\n]/)[0]);
    }

    const firstLine = prompt.split(/\n|\./)[0]?.trim();
    if (firstLine && firstLine.length <= 50) {
      return this.toDisplayName(firstLine.replace(/^tengo\s+/i, ''));
    }

    const fallbackByType: Record<OnboardingAiBusinessType, string> = {
      restaurant: 'Mi Restaurante',
      cafe: 'Mi Cafeteria',
      bar: 'Mi Bar',
      bakery: 'Mi Panaderia',
      'food-truck': 'Mi Food Truck',
      other: 'Mi Negocio',
    };

    return fallbackByType[businessType];
  }

  private extractEmail(prompt: string): string {
    const emailMatch = prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return emailMatch?.[0] ?? '';
  }

  private extractPhone(prompt: string): string {
    const phoneMatch = prompt.match(
      /(?:\+?54\s?)?(?:9\s?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{4}/,
    );
    return phoneMatch?.[0]?.trim() ?? '';
  }

  private extractAddress(prompt: string): string {
    const addressMatch = prompt.match(
      /(?:en|ubicado en|estamos en|direccion|dirección)\s+([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ'.,\- ]{6,80})/i,
    );
    return (
      addressMatch?.[1]
        ?.split(/\s+y\s+hacemos|\s+abrimos|\s+atendemos/i)[0]
        ?.trim() ?? ''
    );
  }

  private extractCity(prompt: string): string {
    const cityMatch = prompt.match(
      /(?:en|ubicado en|estamos en)\s+(?:[A-Za-z0-9ÁÉÍÓÚáéíóúÑñ'\-. ]+,\s*)?([A-Za-zÁÉÍÓÚáéíóúÑñ ]{3,40})/i,
    );
    const city = cityMatch?.[1]?.trim() ?? '';
    if (!city) return '';

    const blockedWords = [
      'lunes',
      'martes',
      'miercoles',
      'jueves',
      'viernes',
      'sabado',
      'domingo',
    ];
    if (blockedWords.some((word) => city.toLowerCase().includes(word))) {
      return '';
    }

    return this.toDisplayName(city);
  }

  private extractPostalCode(prompt: string): string {
    const postalMatch = prompt.match(/\b([A-Z]?\d{4}[A-Z]{0,3})\b/i);
    return postalMatch?.[1] ?? '';
  }

  private buildHours(
    businessType: OnboardingAiBusinessType,
    prompt: string,
    assumptions: string[],
  ): OnboardingAiHours {
    const hoursByType: Record<
      OnboardingAiBusinessType,
      { weekday: OnboardingAiDaySchedule; weekend: OnboardingAiDaySchedule }
    > = {
      restaurant: {
        weekday: this.schedule('12:00', '23:00'),
        weekend: this.schedule('12:00', '23:30'),
      },
      cafe: {
        weekday: this.schedule('08:00', '20:00'),
        weekend: this.schedule('09:00', '20:00'),
      },
      bar: {
        weekday: this.schedule('18:00', '23:30'),
        weekend: this.schedule('18:00', '23:59'),
      },
      bakery: {
        weekday: this.schedule('07:00', '19:00'),
        weekend: this.schedule('08:00', '18:00'),
      },
      'food-truck': {
        weekday: this.schedule('11:30', '22:00'),
        weekend: this.schedule('12:00', '23:00'),
      },
      other: {
        weekday: this.schedule('09:00', '21:00'),
        weekend: this.schedule('10:00', '21:00'),
      },
    };

    const defaults = hoursByType[businessType];
    const mentionsClosedMonday =
      prompt.includes('martes a domingo') ||
      prompt.includes('cerramos los lunes');

    if (!/\d{1,2}[:.]?\d{0,2}/.test(prompt)) {
      assumptions.push(
        'No se detectaron horarios concretos. Se aplicaron horarios sugeridos por tipo de negocio.',
      );
    }

    return {
      monday: mentionsClosedMonday
        ? { isOpen: false, timeRanges: [] }
        : defaults.weekday,
      tuesday: defaults.weekday,
      wednesday: defaults.weekday,
      thursday: defaults.weekday,
      friday: defaults.weekend,
      saturday: defaults.weekend,
      sunday: defaults.weekend,
    };
  }

  private buildCategories(
    cuisines: string[],
    businessType: OnboardingAiBusinessType,
  ): OnboardingAiCategoryDraft[] {
    const key =
      cuisines.find((cuisine) => CATEGORY_SUGGESTIONS[cuisine]) ||
      (businessType === 'cafe'
        ? 'cafe'
        : businessType === 'bakery'
          ? 'bakery'
          : 'parrilla');

    const suggestions =
      CATEGORY_SUGGESTIONS[key] ?? CATEGORY_SUGGESTIONS.parrilla;

    return suggestions.map((category, index) => ({
      id: `ai-category-${index + 1}`,
      name: category.name,
      description: category.description,
    }));
  }

  private extractEstimatedDishes(prompt: string): number | null {
    const match = prompt.match(
      /(\d{1,3})\s*(platos|productos|opciones|items)/i,
    );
    if (!match?.[1]) {
      return null;
    }

    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? value : null;
  }

  private buildDeliveryZones(prompt: string, assumptions: string[]) {
    const hasDelivery =
      prompt.includes('delivery') ||
      prompt.includes('envio') ||
      prompt.includes('envios') ||
      prompt.includes('envíos');

    if (!hasDelivery) {
      assumptions.push(
        'No se detecto informacion clara de delivery. Se dejo deshabilitado por defecto.',
      );
      return {
        enabled: false,
        zones: [],
        estimatedTime: undefined,
        freeDeliveryThreshold: undefined,
      };
    }

    return {
      enabled: true,
      estimatedTime: '35-45 min',
      freeDeliveryThreshold: 25000,
      zones: [
        {
          id: 'ai-zone-1',
          name: 'Zona cercana',
          deliveryFee: 2500,
          minOrder: 12000,
          estimatedTime: '35-45 min',
          areas: [],
        },
      ],
    };
  }

  private buildPaymentMethods(prompt: string, assumptions: string[]) {
    const methods = ['cash', 'debit-card', 'credit-card'];

    if (prompt.includes('mercadopago') || prompt.includes('billetera')) {
      methods.push('digital-wallet');
    }

    if (prompt.includes('transferencia')) {
      methods.push('bank-transfer');
    }

    assumptions.push(
      'Los metodos de pago son sugeridos. Revisar la configuracion operativa antes de lanzar.',
    );

    return {
      enabledMethods: methods,
      requirePrepayment: false,
      acceptTips: true,
      tipPercentages: [10, 15, 20],
    };
  }

  private buildDescription(params: {
    restaurantName: string;
    businessType: OnboardingAiBusinessType;
    cuisines: string[];
  }): string {
    const cuisineText =
      params.cuisines.length > 0
        ? `especializado en ${params.cuisines.join(', ')}`
        : 'con una propuesta gastronomica cuidada';

    return `Bienvenidos a ${params.restaurantName}. Somos un ${params.businessType} ${cuisineText}, pensado para ofrecer una experiencia cercana, consistente y facil de pedir tanto en salon como por canales digitales.`;
  }

  private buildBuilderDraft(params: {
    restaurantName: string;
    businessType: OnboardingAiBusinessType;
    cuisines: string[];
    description: string;
    address: string;
    city: string;
    email: string;
    phone: string;
    postalCode: string;
  }) {
    const paletteKey =
      params.cuisines.find((cuisine) => PALETTES[cuisine]) ||
      (params.businessType === 'cafe'
        ? 'cafe'
        : params.businessType === 'bakery'
          ? 'bakery'
          : 'other');

    const palette = PALETTES[paletteKey] ?? PALETTES.other;

    return {
      restaurant: {
        name: params.restaurantName,
        description: params.description,
        cuisineTypes: params.cuisines,
        type: params.businessType,
        address: params.address,
        city: params.city,
        country: DEFAULT_COUNTRY,
        postalCode: params.postalCode,
        email: params.email,
        phone: params.phone,
      },
      theme: {
        colors: palette,
      },
      sections: {
        hero: {
          title: {
            text: params.restaurantName,
          },
          description: {
            text: params.description,
          },
        },
      },
    };
  }

  private schedule(
    openTime: string,
    closeTime: string,
  ): OnboardingAiDaySchedule {
    return {
      isOpen: true,
      timeRanges: [{ openTime, closeTime }],
    };
  }

  private toDisplayName(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private toSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
