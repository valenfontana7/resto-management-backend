import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CallMeBotService } from '../notifications/callmebot.service';
import {
  ADMIN_ALERT_EVENT_KEY_MAP,
  REGISTRATION_ADMIN_ALERT_EVENT_KEYS,
  PAYMENT_ADMIN_ALERT_EVENT_KEYS,
  AdminAlertEventToggles,
  normalizeAdminAlertEventToggles,
} from './admin-alert-events.config';
import { formatDurationMinutes } from '../common/utils/format-duration.util';

export interface UserRegisteredAlertPayload {
  source: string;
  userId: string;
  name: string;
  email: string;
  restaurantId?: string | null;
  restaurantName?: string | null;
}

export interface RestaurantCreatedAlertPayload {
  source: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  ownerEmail?: string | null;
}

export interface EdgeSyncStaleAlertPayload {
  source: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  localId: string;
  hostname?: string | null;
  lastLanUrl?: string | null;
  pendingPushCount: number;
  minutesSinceActivity: number;
  staleThresholdMinutes: number;
  lastActivityAt: string;
}

export interface AdminEventAlertPayload {
  source: string;
  event: string;
  subject: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface RegistrationAbuseAlertPayload {
  source: string;
  reason: string;
  ip: string;
  email: string;
  name?: string;
  globalCount?: number;
  ipCount?: number;
  identityCount?: number;
  limit?: number;
}

interface ResolvedAdminAlertSettings {
  notifyNewRegistrations: boolean;
  notifyPaymentAlerts: boolean;
  notifyDailySummary: boolean;
  adminEvents: AdminAlertEventToggles;
}

@Injectable()
export class AdminAlertsService {
  private readonly logger = new Logger(AdminAlertsService.name);
  private readonly settingsCacheTtlMs = 30_000;
  private readonly recipientsCacheTtlMs = 60_000;
  private settingsCache: {
    expiresAt: number;
    value: ResolvedAdminAlertSettings;
  } | null = null;
  private recipientsCache: { expiresAt: number; value: string[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    @Optional() private readonly callMeBot?: CallMeBotService,
  ) {}

  private async getSuperAdminRecipients(): Promise<string[]> {
    const now = Date.now();
    if (this.recipientsCache && this.recipientsCache.expiresAt > now) {
      return this.recipientsCache.value;
    }

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        email: { not: '' },
        role: {
          is: {
            name: 'SUPER_ADMIN',
          },
        },
      },
      select: {
        email: true,
      },
    });

    const recipients = [
      ...new Set(users.map((user) => user.email.trim().toLowerCase())),
    ];

    this.recipientsCache = {
      value: recipients,
      expiresAt: now + this.recipientsCacheTtlMs,
    };

    return recipients;
  }

  private async notifySuperAdmins(
    subject: string,
    title: string,
    message: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    const recipients = await this.getSuperAdminRecipients();

    if (recipients.length === 0) {
      this.logger.warn(
        'No hay usuarios SUPER_ADMIN activos para recibir alertas por email',
      );
      return false;
    }

    const results = await Promise.allSettled(
      recipients.map((email) =>
        this.emailService.sendNotificationEmail(
          email,
          subject,
          title,
          message,
          data,
        ),
      ),
    );

    const delivered = results.filter(
      (result) => result.status === 'fulfilled' && result.value,
    ).length;
    this.logger.log(
      `Alerta enviada a ${delivered}/${recipients.length} SUPER_ADMIN`,
    );

    return delivered > 0;
  }

  private async getResolvedSettings(): Promise<ResolvedAdminAlertSettings> {
    const now = Date.now();
    if (this.settingsCache && this.settingsCache.expiresAt > now) {
      return this.settingsCache.value;
    }

    const settings = await this.prisma.systemSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        notifyNewRegistrations: true,
        notifyPaymentAlerts: true,
        notifyDailySummary: true,
        adminAlertPreferences: true,
      },
    });

    const resolved: ResolvedAdminAlertSettings = {
      notifyNewRegistrations: settings?.notifyNewRegistrations ?? true,
      notifyPaymentAlerts: settings?.notifyPaymentAlerts ?? true,
      notifyDailySummary: settings?.notifyDailySummary ?? false,
      adminEvents: normalizeAdminAlertEventToggles(
        settings?.adminAlertPreferences,
      ),
    };

    this.settingsCache = {
      value: resolved,
      expiresAt: now + this.settingsCacheTtlMs,
    };

    return resolved;
  }

  private async isEventEnabled(event: string): Promise<boolean> {
    const eventKey = ADMIN_ALERT_EVENT_KEY_MAP[event];
    if (!eventKey) {
      return true;
    }

    const settings = await this.getResolvedSettings();

    if (
      REGISTRATION_ADMIN_ALERT_EVENT_KEYS.has(eventKey) &&
      !settings.notifyNewRegistrations
    ) {
      return false;
    }

    if (
      PAYMENT_ADMIN_ALERT_EVENT_KEYS.has(eventKey) &&
      !settings.notifyPaymentAlerts
    ) {
      return false;
    }

    return settings.adminEvents[eventKey];
  }

  private getPlatformWhatsAppConfig(): {
    phone: string;
    apiKey: string;
  } | null {
    const phone = process.env.PLATFORM_ALERT_WHATSAPP_PHONE?.trim();
    const apiKey = process.env.PLATFORM_ALERT_WHATSAPP_API_KEY?.trim();
    if (!phone || !apiKey) return null;
    return { phone, apiKey };
  }

  private async notifyPlatformWhatsApp(text: string): Promise<boolean> {
    const config = this.getPlatformWhatsAppConfig();
    if (!config || !this.callMeBot) return false;
    return this.callMeBot.sendMessage(config.phone, config.apiKey, text);
  }

  private buildRegistrationAbuseMessage(
    payload: RegistrationAbuseAlertPayload,
  ): string {
    const lines = [
      '🚨 Bentoo · actividad sospechosa en registros',
      `Motivo: ${payload.reason}`,
      `Email: ${payload.email}`,
    ];

    if (payload.name) lines.push(`Nombre: ${payload.name}`);
    lines.push(`IP: ${payload.ip}`);
    if (payload.globalCount != null) {
      lines.push(`Registros recientes: ${payload.globalCount}`);
    }
    if (payload.ipCount != null) {
      lines.push(`Intentos desde IP: ${payload.ipCount}`);
    }
    if (payload.identityCount != null) {
      lines.push(`Intentos misma identidad: ${payload.identityCount}`);
    }
    if (payload.limit != null) {
      lines.push(`Umbral: ${payload.limit}`);
    }

    lines.push('');
    lines.push('Acción sugerida: /master/settings → Modo mantenimiento ON');
    lines.push('Panel: bentoo.com.ar/master/users');

    return lines.join('\n');
  }

  async notifyRegistrationAbuse(
    payload: RegistrationAbuseAlertPayload,
  ): Promise<boolean> {
    const message = this.buildRegistrationAbuseMessage(payload);
    const whatsappSent = await this.notifyPlatformWhatsApp(message);

    const emailSent = await this.notifyAdminEvent({
      source: payload.source,
      event: 'REGISTRATION_ABUSE_SPIKE',
      subject: '🚨 Registros sospechosos detectados',
      title: 'Posible abuso de registro',
      message,
      data: {
        reason: payload.reason,
        ip: payload.ip,
        email: payload.email,
        name: payload.name ?? null,
        globalCount: payload.globalCount ?? null,
        ipCount: payload.ipCount ?? null,
        identityCount: payload.identityCount ?? null,
        limit: payload.limit ?? null,
        whatsappSent,
      },
    });

    return whatsappSent || emailSent;
  }

  async notifyUserRegistered(
    payload: UserRegisteredAlertPayload,
  ): Promise<boolean> {
    const message = payload.restaurantName
      ? `Se registró un nuevo usuario (${payload.email}) en el restaurante ${payload.restaurantName}.`
      : `Se registró un nuevo usuario (${payload.email}) en la plataforma.`;

    return this.notifyAdminEvent({
      source: payload.source,
      event: 'USER_REGISTERED',
      subject: '🆕 Nuevo usuario registrado',
      title: 'Nuevo usuario registrado',
      message,
      data: {
        userId: payload.userId,
        userName: payload.name,
        userEmail: payload.email,
        restaurantId: payload.restaurantId ?? null,
        restaurantName: payload.restaurantName ?? null,
      },
    });
  }

  async notifyRestaurantCreated(
    payload: RestaurantCreatedAlertPayload,
  ): Promise<boolean> {
    const message = `Se creó un nuevo restaurante: ${payload.restaurantName} (${payload.restaurantSlug}).`;

    return this.notifyAdminEvent({
      source: payload.source,
      event: 'RESTAURANT_CREATED',
      subject: '🏪 Nuevo restaurante creado',
      title: 'Nuevo restaurante creado',
      message,
      data: {
        restaurantId: payload.restaurantId,
        restaurantName: payload.restaurantName,
        restaurantSlug: payload.restaurantSlug,
        ownerEmail: payload.ownerEmail ?? null,
      },
    });
  }

  async notifyEdgeSyncStale(
    payload: EdgeSyncStaleAlertPayload,
  ): Promise<boolean> {
    const message =
      `La caja principal de ${payload.restaurantName} lleva ${formatDurationMinutes(payload.minutesSinceActivity)} sin sincronizar con la nube ` +
      `(umbral ${formatDurationMinutes(payload.staleThresholdMinutes, 'short')}). Revisá conectividad, servicio BentooSalonLocal o outbox pendiente.`;

    return this.notifyAdminEvent({
      source: payload.source,
      event: 'EDGE_SYNC_STALE',
      subject: `⚠️ Sync local detenido · ${payload.restaurantName}`,
      title: 'Servidor local sin sincronizar',
      message,
      data: {
        restaurantId: payload.restaurantId,
        restaurantName: payload.restaurantName,
        restaurantSlug: payload.restaurantSlug,
        localId: payload.localId,
        hostname: payload.hostname ?? null,
        lastLanUrl: payload.lastLanUrl ?? null,
        pendingPushCount: payload.pendingPushCount,
        minutesSinceActivity: payload.minutesSinceActivity,
        staleThresholdMinutes: payload.staleThresholdMinutes,
        lastActivityAt: payload.lastActivityAt,
      },
    });
  }

  async notifyProductFeedback(payload: {
    source: string;
    feedbackId: string;
    type: string;
    typeLabel: string;
    title: string;
    message: string;
    priority?: string | null;
    category?: string | null;
    rating?: number | null;
    screenshotCount: number;
    restaurantId?: string | null;
    restaurantName: string;
    userEmail?: string | null;
    userName?: string | null;
    userLabel: string;
  }): Promise<boolean> {
    const lines = [
      `Tipo: ${payload.typeLabel}`,
      `De: ${payload.userLabel}`,
      `Restaurante: ${payload.restaurantName}`,
    ];
    if (payload.priority) lines.push(`Prioridad: ${payload.priority}`);
    if (payload.category) lines.push(`Área: ${payload.category}`);
    if (payload.rating != null) lines.push(`Rating: ${payload.rating}/5`);
    if (payload.screenshotCount > 0) {
      lines.push(`Capturas: ${payload.screenshotCount}`);
    }
    lines.push('');
    lines.push(payload.message);
    lines.push('');
    lines.push(`Inbox: bentoo.com.ar/master/feedback`);

    return this.notifyAdminEvent({
      source: payload.source,
      event: 'PRODUCT_FEEDBACK',
      subject: `💬 Feedback · ${payload.typeLabel}: ${payload.title}`,
      title: `Nuevo feedback de producto (${payload.typeLabel})`,
      message: lines.join('\n'),
      data: {
        feedbackId: payload.feedbackId,
        type: payload.type,
        priority: payload.priority ?? null,
        category: payload.category ?? null,
        rating: payload.rating ?? null,
        screenshotCount: payload.screenshotCount,
        restaurantId: payload.restaurantId ?? null,
        restaurantName: payload.restaurantName,
        userEmail: payload.userEmail ?? null,
        userName: payload.userName ?? null,
      },
    });
  }

  async notifyAdminEvent(payload: AdminEventAlertPayload): Promise<boolean> {
    try {
      const eventEnabled = await this.isEventEnabled(payload.event);
      if (!eventEnabled) {
        this.logger.log(
          `Alerta ${payload.event} omitida por configuración de master settings`,
        );
        return false;
      }

      return await this.notifySuperAdmins(
        payload.subject,
        payload.title,
        payload.message,
        {
          source: payload.source,
          event: payload.event,
          ...(payload.data || {}),
          createdAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error enviando alerta ${payload.event}: ${errorMessage}`,
      );
      return false;
    }
  }
}
