import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';
import { renderCustomerMagicLinkEmail } from '../email/email-templates';
import { ImageProcessingService } from '../common/services/image-processing.service';
import { PrismaService } from '../prisma/prisma.service';

type CustomerProfileInput = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  marketingOptIn?: boolean;
};

type CustomerDefaultAddress = {
  label: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  reference: string | null;
  notes: string | null;
};

type CustomerDefaultAddressInput = {
  label?: string | null;
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  reference?: string | null;
  notes?: string | null;
};

type CustomerFavoriteDish = {
  dishId: string;
  name: string;
};

type CustomerFavoriteDishInput = {
  dishId?: string | null;
  name?: string | null;
};

type CustomerPreferences = {
  preferredOrderType: 'delivery' | 'pickup' | null;
  dietaryNotes: string | null;
  favoriteDishes: CustomerFavoriteDish[];
};

type CustomerPreferencesInput = {
  preferredOrderType?: 'delivery' | 'pickup' | null;
  dietaryNotes?: string | null;
  favoriteDishes?: CustomerFavoriteDishInput[];
};

type CustomerAccountInput = {
  displayName?: string | null;
  phone?: string | null;
  marketingOptIn?: boolean;
  defaultAddress?: CustomerDefaultAddressInput | null;
  preferences?: CustomerPreferencesInput | null;
};

type CustomerSessionRequestInput = {
  email?: string | null;
  phone?: string | null;
  redirect?: string | null;
};

type PublicProfileRecord = {
  id: string;
  restaurantId: string;
  identityId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  marketingOptIn: boolean;
  defaultAddress: Prisma.JsonValue | null;
  preferences: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  identity: {
    id: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    createdAt: Date;
  };
};

type SessionProfileRecord = PublicProfileRecord & {
  restaurant: {
    id: string;
    slug: string;
    name: string;
    logo: string | null;
  };
};

type CustomerSessionPayload = {
  sub: string;
  restaurantId: string;
  identityId: string;
  type: 'customer-session';
};

type ResolvedCustomerSession = {
  profile: PublicProfileRecord;
  expiresAt: string | null;
};

const CUSTOMER_MAGIC_LINK_EXPIRY_MINUTES = 15;
const CUSTOMER_SESSION_EXPIRY_DAYS = 30;
const CUSTOMER_SESSION_JWT_TYPE = 'customer-session' as const;

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly images: ImageProcessingService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  async upsertProfile(restaurantId: string, input: CustomerProfileInput) {
    const email = this.normalizeEmail(input.email);
    const phone = this.normalizePhone(input.phone);
    const name = input.name?.trim() || '';

    if (!email && !phone) {
      throw new BadRequestException('Email o telefono requerido');
    }

    const identity = await this.upsertIdentity({ email, phone });
    const existingProfile =
      await this.prisma.restaurantCustomerProfile.findUnique({
        where: {
          restaurantId_identityId: {
            restaurantId,
            identityId: identity.id,
          },
        },
      });

    const displayName = this.resolveDisplayName(
      name,
      existingProfile?.displayName,
      email || identity.email,
      phone || identity.phone,
    );
    const profileEmail = email || existingProfile?.email || identity.email;
    const profilePhone = phone || existingProfile?.phone || identity.phone;

    const profile = existingProfile
      ? await this.prisma.restaurantCustomerProfile.update({
          where: { id: existingProfile.id },
          data: {
            displayName,
            email: profileEmail || null,
            phone: profilePhone || null,
            ...(input.marketingOptIn === true ? { marketingOptIn: true } : {}),
          },
          include: this.publicProfileInclude(),
        })
      : await this.prisma.restaurantCustomerProfile.create({
          data: {
            restaurantId,
            identityId: identity.id,
            displayName,
            email: profileEmail || undefined,
            phone: profilePhone || undefined,
            marketingOptIn: input.marketingOptIn === true,
          },
          include: this.publicProfileInclude(),
        });

    if (profile.email) {
      await this.linkLoyaltyAccount(restaurantId, profile.email, profile.id);
    }

    return this.toPublicProfile(profile);
  }

  async requestSession(
    restaurantId: string,
    input: CustomerSessionRequestInput,
  ) {
    const email = this.normalizeEmail(input.email);
    const phone = this.normalizePhone(input.phone);
    const response: {
      sent: true;
      channel: 'email';
      expiresInMinutes: number;
      devLink?: string;
    } = {
      sent: true,
      channel: 'email',
      expiresInMinutes: CUSTOMER_MAGIC_LINK_EXPIRY_MINUTES,
    };

    if (!email && !phone) {
      throw new BadRequestException('Email o telefono requerido');
    }

    const profile = await this.findSessionProfileByContact(restaurantId, {
      email,
      phone,
    });

    if (!profile?.email) {
      return response;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashLoginToken(rawToken);
    const expiresAt = new Date(
      Date.now() + CUSTOMER_MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.customerLoginLink.updateMany({
        where: {
          customerProfileId: profile.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      }),
      this.prisma.customerLoginLink.create({
        data: {
          customerProfileId: profile.id,
          tokenHash,
          channel: 'email',
          expiresAt,
        },
      }),
    ]);

    const link = this.buildCustomerMagicLink(
      profile.restaurant.slug,
      rawToken,
      input.redirect,
    );
    const html = renderCustomerMagicLinkEmail({
      restaurantName: profile.restaurant.name,
      customerName: profile.displayName,
      link,
      expiresInMinutes: CUSTOMER_MAGIC_LINK_EXPIRY_MINUTES,
      logoUrl: await this.images.toEmailAssetUrl(profile.restaurant.logo),
    });

    await this.emailService?.sendGenericEmail(
      profile.email,
      `Tu acceso a ${profile.restaurant.name}`,
      html,
      profile.restaurant.name,
    );

    if (process.env.NODE_ENV !== 'production') {
      response.devLink = link;
    }

    return response;
  }

  async consumeSession(restaurantId: string, rawToken?: string | null) {
    const token = rawToken?.trim();
    if (!token || token.length < 24) {
      throw new BadRequestException('Link invalido o expirado');
    }

    const tokenHash = this.hashLoginToken(token);
    const link = await this.prisma.customerLoginLink.findUnique({
      where: { tokenHash },
      include: {
        customerProfile: {
          include: this.sessionProfileInclude(),
        },
      },
    });

    const now = new Date();
    if (
      !link ||
      link.usedAt ||
      link.expiresAt.getTime() < now.getTime() ||
      link.customerProfile.restaurantId !== restaurantId
    ) {
      throw new BadRequestException('Link invalido o expirado');
    }

    const consumed = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.customerLoginLink.updateMany({
        where: {
          id: link.id,
          usedAt: null,
          expiresAt: { gte: now },
        },
        data: { usedAt: now },
      });

      if (updateResult.count !== 1) {
        throw new BadRequestException('Link invalido o expirado');
      }

      if (
        link.customerProfile.email &&
        !link.customerProfile.identity.emailVerified
      ) {
        await tx.customerIdentity.update({
          where: { id: link.customerProfile.identityId },
          data: { emailVerified: true },
        });
      }

      return {
        ...link.customerProfile,
        identity: {
          ...link.customerProfile.identity,
          emailVerified:
            link.customerProfile.email != null
              ? true
              : link.customerProfile.identity.emailVerified,
        },
      } satisfies SessionProfileRecord;
    });

    return this.createSessionResponse(consumed);
  }

  async getSession(restaurantId: string, authorization?: string) {
    const session = await this.resolveSessionProfile(
      restaurantId,
      authorization,
    );
    if (!session) {
      return { session: null };
    }

    return {
      session: {
        profile: this.toPublicProfile(session.profile),
        expiresAt: session.expiresAt,
      },
    };
  }

  async getAccountOverview(restaurantId: string, authorization?: string) {
    const session = await this.requireSessionProfile(
      restaurantId,
      authorization,
    );
    const contactWhere = this.buildCustomerContactWhere(session.profile);

    const [orders, reservations, loyalty] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          restaurantId,
          ...contactWhere,
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          type: true,
          total: true,
          discount: true,
          couponCode: true,
          publicTrackingToken: true,
          createdAt: true,
          items: {
            select: {
              dishId: true,
              quantity: true,
              dish: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.reservation.findMany({
        where: {
          restaurantId,
          ...contactWhere,
        },
        orderBy: [{ date: 'desc' }, { time: 'desc' }],
        take: 12,
        select: {
          id: true,
          date: true,
          time: true,
          partySize: true,
          status: true,
          notes: true,
          createdAt: true,
        },
      }),
      this.prisma.loyaltyAccount.findFirst({
        where: {
          restaurantId,
          OR: [
            { customerProfileId: session.profile.id },
            ...(session.profile.email
              ? [{ customerEmail: session.profile.email }]
              : []),
          ],
        },
        select: {
          id: true,
          points: true,
          totalEarned: true,
          totalRedeemed: true,
          tier: true,
        },
      }),
    ]);

    const recentCouponCodes = Array.from(
      new Set(
        orders
          .map((order) => order.couponCode?.trim() || '')
          .filter((couponCode) => couponCode.length > 0),
      ),
    );
    const coupons = recentCouponCodes.length
      ? await this.prisma.coupon.findMany({
          where: {
            restaurantId,
            code: { in: recentCouponCodes },
          },
          select: {
            code: true,
            name: true,
            description: true,
            type: true,
            value: true,
          },
        })
      : [];
    const couponsByCode = new Map(
      coupons.map((coupon) => [coupon.code, coupon]),
    );

    return {
      profile: this.toPublicProfile(session.profile),
      loyalty: loyalty
        ? {
            id: loyalty.id,
            points: loyalty.points,
            totalEarned: loyalty.totalEarned,
            totalRedeemed: loyalty.totalRedeemed,
            tier: loyalty.tier,
          }
        : null,
      recentOrders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        type: order.type,
        total: order.total,
        discount: order.discount,
        couponCode: order.couponCode,
        publicTrackingToken: order.publicTrackingToken,
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
          dishId: item.dishId,
          name: item.dish.name,
          quantity: item.quantity,
        })),
      })),
      recentReservations: reservations.map((reservation) => ({
        id: reservation.id,
        date: reservation.date,
        time: reservation.time,
        partySize: reservation.partySize,
        status: reservation.status,
        notes: reservation.notes,
        createdAt: reservation.createdAt,
      })),
      recentCoupons: recentCouponCodes.map((couponCode) => {
        const coupon = couponsByCode.get(couponCode);
        const lastUsage = orders.find(
          (order) => order.couponCode === couponCode,
        );

        return {
          code: couponCode,
          name: coupon?.name || couponCode,
          description: coupon?.description || null,
          type: coupon?.type || null,
          value: coupon ? Number(coupon.value) : null,
          lastDiscount: lastUsage?.discount || 0,
          lastUsedAt: lastUsage?.createdAt || null,
        };
      }),
    };
  }

  async updateAccount(
    restaurantId: string,
    authorization: string | undefined,
    input: CustomerAccountInput,
  ) {
    const session = await this.requireSessionProfile(
      restaurantId,
      authorization,
    );
    const nextPhone =
      input.phone !== undefined
        ? this.normalizePhone(input.phone) || null
        : session.profile.phone;
    const data: Prisma.RestaurantCustomerProfileUpdateInput = {};

    if (input.displayName !== undefined) {
      data.displayName = this.resolveDisplayName(
        input.displayName,
        session.profile.displayName,
        session.profile.email,
        nextPhone,
      );
    }

    if (input.phone !== undefined) {
      data.phone = nextPhone;
    }

    if (input.marketingOptIn !== undefined) {
      data.marketingOptIn = input.marketingOptIn;
    }

    if (input.defaultAddress !== undefined) {
      data.defaultAddress = this.serializeDefaultAddress(input.defaultAddress);
    }

    if (input.preferences !== undefined) {
      data.preferences = this.serializePreferences(input.preferences);
    }

    if (Object.keys(data).length === 0) {
      return this.toPublicProfile(session.profile);
    }

    const profile = await this.prisma.restaurantCustomerProfile.update({
      where: { id: session.profile.id },
      data,
      include: this.publicProfileInclude(),
    });

    return this.toPublicProfile(profile as PublicProfileRecord);
  }

  async resolveSessionProfile(
    restaurantId: string,
    authorization?: string,
  ): Promise<ResolvedCustomerSession | null> {
    const token = this.extractBearerToken(authorization);
    if (!token) {
      return null;
    }

    let payload: (CustomerSessionPayload & { exp?: number }) | null = null;

    try {
      payload = await this.jwtService.verifyAsync<
        CustomerSessionPayload & { exp?: number }
      >(token);
    } catch {
      return null;
    }

    if (
      !payload ||
      payload.type !== CUSTOMER_SESSION_JWT_TYPE ||
      payload.restaurantId !== restaurantId
    ) {
      return null;
    }

    const profile = await this.prisma.restaurantCustomerProfile.findUnique({
      where: { id: payload.sub },
      include: this.publicProfileInclude(),
    });

    if (!profile || profile.restaurantId !== restaurantId) {
      return null;
    }

    return {
      profile: profile as PublicProfileRecord,
      expiresAt: payload.exp
        ? new Date(payload.exp * 1000).toISOString()
        : null,
    };
  }

  private async requireSessionProfile(
    restaurantId: string,
    authorization?: string,
  ) {
    const session = await this.resolveSessionProfile(
      restaurantId,
      authorization,
    );
    if (!session) {
      throw new UnauthorizedException('Sesion de cliente invalida o expirada');
    }

    return session;
  }

  async getProfileByContact(
    restaurantId: string,
    contact: { email?: string | null; phone?: string | null },
  ) {
    const email = this.normalizeEmail(contact.email);
    const phone = this.normalizePhone(contact.phone);

    if (!email && !phone) {
      throw new BadRequestException('Email o telefono requerido');
    }

    const profile = await this.prisma.restaurantCustomerProfile.findFirst({
      where: {
        restaurantId,
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      include: this.publicProfileInclude(),
    });

    return profile ? this.toPublicProfile(profile) : null;
  }

  private async findSessionProfileByContact(
    restaurantId: string,
    contact: { email?: string | null; phone?: string | null },
  ): Promise<SessionProfileRecord | null> {
    const email = this.normalizeEmail(contact.email);
    const phone = this.normalizePhone(contact.phone);

    if (!email && !phone) {
      return null;
    }

    return this.prisma.restaurantCustomerProfile.findFirst({
      where: {
        restaurantId,
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      include: this.sessionProfileInclude(),
    }) as Promise<SessionProfileRecord | null>;
  }

  private async upsertIdentity(contact: { email: string; phone: string }) {
    const { email, phone } = contact;
    let identity = email
      ? await this.prisma.customerIdentity.findUnique({ where: { email } })
      : null;

    if (!identity && phone) {
      identity = await this.prisma.customerIdentity.findUnique({
        where: { phone },
      });
    }

    if (!identity) {
      return this.prisma.customerIdentity.create({
        data: {
          email: email || undefined,
          phone: phone || undefined,
        },
      });
    }

    const data: Prisma.CustomerIdentityUpdateInput = {};

    if (email && !identity.email) {
      data.email = email;
    }

    if (phone && !identity.phone) {
      data.phone = phone;
    }

    if (Object.keys(data).length === 0) {
      return identity;
    }

    try {
      return await this.prisma.customerIdentity.update({
        where: { id: identity.id },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `No se pudo completar contacto de customerIdentity ${identity.id}: contacto duplicado`,
        );
        return identity;
      }

      throw error;
    }
  }

  private async linkLoyaltyAccount(
    restaurantId: string,
    customerEmail: string,
    profileId: string,
  ) {
    await this.prisma.loyaltyAccount.updateMany({
      where: {
        restaurantId,
        customerEmail,
        customerProfileId: null,
      },
      data: {
        customerProfileId: profileId,
      },
    });
  }

  private publicProfileInclude() {
    return {
      identity: {
        select: {
          id: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
        },
      },
    } as const;
  }

  private sessionProfileInclude() {
    return {
      identity: {
        select: {
          id: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
        },
      },
      restaurant: {
        select: {
          id: true,
          slug: true,
          name: true,
          logo: true,
        },
      },
    } as const;
  }

  private toPublicProfile(profile: PublicProfileRecord) {
    return {
      id: profile.id,
      restaurantId: profile.restaurantId,
      displayName: profile.displayName,
      email: profile.email,
      phone: profile.phone,
      marketingOptIn: profile.marketingOptIn,
      defaultAddress: this.parseDefaultAddress(profile.defaultAddress),
      preferences: this.parsePreferences(profile.preferences),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      identity: {
        id: profile.identity.id,
        emailVerified: profile.identity.emailVerified,
        phoneVerified: profile.identity.phoneVerified,
        createdAt: profile.identity.createdAt,
      },
    };
  }

  private createSessionResponse(profile: SessionProfileRecord) {
    const payload: CustomerSessionPayload = {
      sub: profile.id,
      restaurantId: profile.restaurantId,
      identityId: profile.identityId,
      type: CUSTOMER_SESSION_JWT_TYPE,
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: `${CUSTOMER_SESSION_EXPIRY_DAYS}d`,
    });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CUSTOMER_SESSION_EXPIRY_DAYS);

    return {
      profile: this.toPublicProfile(profile),
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private getFrontendUrl() {
    return (
      process.env.FRONTEND_URL?.trim().replace(/\/$/, '') ||
      process.env.BASE_URL?.trim().replace(/\/$/, '') ||
      'http://localhost:3000'
    );
  }

  private normalizeCustomerRedirect(
    restaurantSlug: string,
    redirect?: string | null,
  ) {
    const defaultRedirect = `/${restaurantSlug}/cuenta`;
    if (!redirect) return defaultRedirect;

    const trimmed = redirect.trim();
    if (!trimmed.startsWith('/')) return defaultRedirect;
    if (trimmed.startsWith('//')) return defaultRedirect;

    const normalizedPath =
      (trimmed.split(/[?#]/, 1)[0] || '/').replace(/\/+$/, '') || '/';
    const callbackPath = `/${restaurantSlug}/cuenta/magic-link`;

    if (!normalizedPath.startsWith(`/${restaurantSlug}`)) {
      return defaultRedirect;
    }

    if (normalizedPath === callbackPath) {
      return defaultRedirect;
    }

    return trimmed;
  }

  private buildCustomerMagicLink(
    restaurantSlug: string,
    token: string,
    redirect?: string | null,
  ) {
    const url = new URL(
      `/${restaurantSlug}/cuenta/magic-link`,
      this.getFrontendUrl(),
    );
    url.searchParams.set('token', token);
    url.searchParams.set(
      'redirect',
      this.normalizeCustomerRedirect(restaurantSlug, redirect),
    );
    return url.toString();
  }

  private extractBearerToken(authorization?: string | null) {
    if (!authorization) return null;

    const trimmed = authorization.trim();
    if (!/^Bearer\s+/i.test(trimmed)) {
      return null;
    }

    return trimmed.replace(/^Bearer\s+/i, '').trim() || null;
  }

  private hashLoginToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildCustomerContactWhere(
    profile: Pick<PublicProfileRecord, 'id' | 'email' | 'phone'>,
  ) {
    return {
      OR: [
        { customerProfileId: profile.id },
        ...(profile.email ? [{ customerEmail: profile.email }] : []),
        ...(profile.phone ? [{ customerPhone: profile.phone }] : []),
      ],
    };
  }

  private parseDefaultAddress(
    value: Prisma.JsonValue | null,
  ): CustomerDefaultAddress | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const address: CustomerDefaultAddress = {
      label: this.readJsonString(record, 'label'),
      street: this.readJsonString(record, 'street'),
      city: this.readJsonString(record, 'city'),
      postalCode: this.readJsonString(record, 'postalCode'),
      reference: this.readJsonString(record, 'reference'),
      notes: this.readJsonString(record, 'notes'),
    };

    return Object.values(address).some((entry) => Boolean(entry))
      ? address
      : null;
  }

  private parsePreferences(
    value: Prisma.JsonValue | null,
  ): CustomerPreferences {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        preferredOrderType: null,
        dietaryNotes: null,
        favoriteDishes: [],
      };
    }

    const record = value as Record<string, unknown>;
    const preferredOrderType = this.readJsonString(
      record,
      'preferredOrderType',
    );
    const favoriteDishes = Array.isArray(record.favoriteDishes)
      ? record.favoriteDishes
          .filter(
            (entry): entry is Record<string, unknown> =>
              typeof entry === 'object' &&
              entry !== null &&
              !Array.isArray(entry),
          )
          .map((entry) => ({
            dishId: this.readJsonString(entry, 'dishId') || '',
            name: this.readJsonString(entry, 'name') || '',
          }))
          .filter((entry) => entry.dishId && entry.name)
      : [];

    return {
      preferredOrderType:
        preferredOrderType === 'delivery' || preferredOrderType === 'pickup'
          ? preferredOrderType
          : null,
      dietaryNotes: this.readJsonString(record, 'dietaryNotes'),
      favoriteDishes: this.uniqueFavoriteDishes(favoriteDishes),
    };
  }

  private serializeDefaultAddress(
    value: CustomerDefaultAddressInput | null | undefined,
  ) {
    const label = this.normalizeNullableString(value?.label);
    const street = this.normalizeNullableString(value?.street);
    const city = this.normalizeNullableString(value?.city);
    const postalCode = this.normalizeNullableString(value?.postalCode);
    const reference = this.normalizeNullableString(value?.reference);
    const notes = this.normalizeNullableString(value?.notes);

    const address = {
      ...(label ? { label } : {}),
      ...(street ? { street } : {}),
      ...(city ? { city } : {}),
      ...(postalCode ? { postalCode } : {}),
      ...(reference ? { reference } : {}),
      ...(notes ? { notes } : {}),
    } satisfies Record<string, string>;

    return address as Prisma.InputJsonValue;
  }

  private serializePreferences(
    value: CustomerPreferencesInput | null | undefined,
  ) {
    const preferences = {
      ...(value?.preferredOrderType
        ? { preferredOrderType: value.preferredOrderType }
        : {}),
      ...(this.normalizeNullableString(value?.dietaryNotes)
        ? { dietaryNotes: this.normalizeNullableString(value?.dietaryNotes) }
        : {}),
      ...(value?.favoriteDishes?.length
        ? {
            favoriteDishes: this.uniqueFavoriteDishes(value.favoriteDishes).map(
              (dish) => ({
                dishId: dish.dishId,
                name: dish.name,
              }),
            ),
          }
        : {}),
    } satisfies Record<string, unknown>;

    return preferences as Prisma.InputJsonValue;
  }

  private uniqueFavoriteDishes(favoriteDishes: CustomerFavoriteDishInput[]) {
    const seen = new Set<string>();

    return favoriteDishes
      .map((dish) => ({
        dishId: this.normalizeNullableString(dish.dishId) || '',
        name: this.normalizeNullableString(dish.name) || '',
      }))
      .filter((dish) => dish.dishId && dish.name)
      .filter((dish) => {
        if (seen.has(dish.dishId)) {
          return false;
        }

        seen.add(dish.dishId);
        return true;
      })
      .slice(0, 20);
  }

  private readJsonString(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private resolveDisplayName(
    requestedName?: string | null,
    existingName?: string | null,
    email?: string | null,
    phone?: string | null,
  ) {
    const name = requestedName?.trim() || existingName?.trim();
    if (name) return name;

    if (email) return email.split('@')[0] || 'Cliente';
    if (phone) return phone;
    return 'Cliente';
  }

  private normalizeEmail(email?: string | null) {
    return email?.trim().toLowerCase() || '';
  }

  private normalizeNullableString(value?: string | null) {
    return value?.trim() || null;
  }

  private normalizePhone(phone?: string | null) {
    return phone?.replace(/\s+/g, '').trim() || '';
  }
}
