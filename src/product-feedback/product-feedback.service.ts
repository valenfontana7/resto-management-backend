import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ProductFeedbackPriority,
  ProductFeedbackStatus,
  ProductFeedbackType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAlertsService } from '../admin-alerts/admin-alerts.service';
import { CreateProductFeedbackDto } from './dto/create-product-feedback.dto';

const TYPE_LABELS: Record<ProductFeedbackType, string> = {
  BUG_REPORT: 'Bug',
  FEATURE_REQUEST: 'Idea / feature',
  PRODUCT_FEEDBACK: 'Feedback de producto',
  INTEGRATION_REQUEST: 'Integración',
  GENERAL_COMMENT: 'Comentario',
};

@Injectable()
export class ProductFeedbackService {
  private readonly logger = new Logger(ProductFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAlerts: AdminAlertsService,
  ) {}

  async create(
    restaurantId: string | null,
    userId: string,
    dto: CreateProductFeedbackDto,
  ) {
    const context = this.sanitizeContext(dto.context);
    const screenshotLabels = (dto.screenshotLabels ?? [])
      .map((label) => label.trim())
      .filter(Boolean)
      .slice(0, 10);

    const row = await this.prisma.productFeedback.create({
      data: {
        restaurantId: restaurantId || null,
        userId,
        type: dto.type,
        title: dto.title?.trim() || null,
        message: dto.message.trim(),
        category: dto.category?.trim() || null,
        priority: dto.priority ?? null,
        rating: dto.rating ?? null,
        integrationPlatform: dto.integrationPlatform?.trim() || null,
        useCase: dto.useCase?.trim() || null,
        ...(context ? { context: context as Prisma.InputJsonValue } : {}),
        screenshotCount: Math.max(0, dto.screenshotCount ?? 0),
        screenshotLabels,
        clientSubmissionId: dto.clientSubmissionId?.trim() || null,
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : new Date(),
      },
      include: {
        restaurant: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    void this.notifyMasters(row).catch((error) => {
      this.logger.warn(
        `No se pudo notificar feedback ${row.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return {
      id: row.id,
      status: row.status,
      submittedAt: row.submittedAt,
    };
  }

  async listForMaster(options: {
    page?: number;
    limit?: number;
    status?: ProductFeedbackStatus;
    type?: ProductFeedbackType;
    search?: string;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 30));
    const where = {
      ...(options.status ? { status: options.status } : {}),
      ...(options.type ? { type: options.type } : {}),
      ...(options.search
        ? {
            OR: [
              {
                message: {
                  contains: options.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                title: {
                  contains: options.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                user: {
                  email: {
                    contains: options.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                restaurant: {
                  name: {
                    contains: options.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productFeedback.count({ where }),
      this.prisma.productFeedback.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          restaurant: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateStatus(id: string, status: ProductFeedbackStatus) {
    const existing = await this.prisma.productFeedback.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Feedback no encontrado');
    }

    const row = await this.prisma.productFeedback.update({
      where: { id },
      data: { status },
      include: {
        restaurant: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return this.toListItem(row);
  }

  private toListItem(row: {
    id: string;
    type: ProductFeedbackType;
    title: string | null;
    message: string;
    category: string | null;
    priority: ProductFeedbackPriority | null;
    rating: number | null;
    integrationPlatform: string | null;
    useCase: string | null;
    status: ProductFeedbackStatus;
    context: unknown;
    screenshotCount: number;
    screenshotLabels: string[];
    clientSubmissionId: string | null;
    submittedAt: Date;
    createdAt: Date;
    restaurant: { id: string; name: string; slug: string } | null;
    user: { id: string; name: string; email: string } | null;
  }) {
    return {
      id: row.id,
      type: row.type,
      typeLabel: TYPE_LABELS[row.type],
      title: row.title,
      message: row.message,
      category: row.category,
      priority: row.priority,
      rating: row.rating,
      integrationPlatform: row.integrationPlatform,
      useCase: row.useCase,
      status: row.status,
      context: row.context,
      screenshotCount: row.screenshotCount,
      screenshotLabels: row.screenshotLabels,
      clientSubmissionId: row.clientSubmissionId,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
      restaurant: row.restaurant,
      user: row.user,
    };
  }

  private sanitizeContext(
    context?: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!context || typeof context !== 'object') return null;

    const clone = { ...context };
    delete clone.screenshots;
    delete clone.screenshot;
    delete clone.images;

    // Evitar payloads enormes (screenshots embebidos o dumps).
    const serialized = JSON.stringify(clone);
    if (serialized.length > 40_000) {
      return {
        truncated: true,
        route: clone.route ?? null,
        module: clone.module ?? null,
        versions: clone.versions ?? null,
        device: clone.device ?? null,
        browser: clone.browser ?? null,
        error: clone.error ?? null,
      };
    }

    return clone;
  }

  private async notifyMasters(row: {
    id: string;
    type: ProductFeedbackType;
    title: string | null;
    message: string;
    priority: ProductFeedbackPriority | null;
    category: string | null;
    rating: number | null;
    screenshotCount: number;
    restaurant: { id: string; name: string; slug: string } | null;
    user: { id: string; name: string; email: string } | null;
  }): Promise<void> {
    const typeLabel = TYPE_LABELS[row.type];
    const restaurantLabel = row.restaurant
      ? `${row.restaurant.name} (${row.restaurant.slug})`
      : 'Sin restaurante';
    const userLabel = row.user
      ? `${row.user.name} <${row.user.email}>`
      : 'Usuario desconocido';
    const subjectTitle = row.title?.trim() || typeLabel;
    const preview =
      row.message.length > 280 ? `${row.message.slice(0, 277)}…` : row.message;

    await this.adminAlerts.notifyProductFeedback({
      source: 'product-feedback',
      feedbackId: row.id,
      type: row.type,
      typeLabel,
      title: subjectTitle,
      message: preview,
      priority: row.priority,
      category: row.category,
      rating: row.rating,
      screenshotCount: row.screenshotCount,
      restaurantId: row.restaurant?.id ?? null,
      restaurantName: restaurantLabel,
      userEmail: row.user?.email ?? null,
      userName: row.user?.name ?? null,
      userLabel,
    });
  }
}
