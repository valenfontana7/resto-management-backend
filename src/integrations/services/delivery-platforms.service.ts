import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePlatformDto,
  UpdatePlatformDto,
} from '../dto/delivery-platform.dto';

@Injectable()
export class DeliveryPlatformsService {
  private readonly logger = new Logger(DeliveryPlatformsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(restaurantId: string) {
    return this.prisma.deliveryPlatform.findMany({
      where: { restaurantId },
      select: {
        id: true,
        platform: true,
        isActive: true,
        storeId: true,
        config: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { externalOrders: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(restaurantId: string, dto: CreatePlatformDto) {
    const existing = await this.prisma.deliveryPlatform.findUnique({
      where: {
        restaurantId_platform: { restaurantId, platform: dto.platform },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Platform ${dto.platform} already configured`,
      );
    }

    const webhookSecret = this.generateWebhookSecret();

    return this.prisma.deliveryPlatform.create({
      data: {
        restaurantId,
        platform: dto.platform,
        apiKey: dto.apiKey,
        apiSecret: dto.apiSecret,
        storeId: dto.storeId,
        webhookSecret,
        config: dto.config ?? {},
      },
    });
  }

  async update(
    restaurantId: string,
    platformId: string,
    dto: UpdatePlatformDto,
  ) {
    const platform = await this.findPlatform(restaurantId, platformId);

    return this.prisma.deliveryPlatform.update({
      where: { id: platform.id },
      data: {
        ...(dto.apiKey !== undefined && { apiKey: dto.apiKey }),
        ...(dto.apiSecret !== undefined && { apiSecret: dto.apiSecret }),
        ...(dto.storeId !== undefined && { storeId: dto.storeId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.config !== undefined && { config: dto.config }),
      },
    });
  }

  async toggle(restaurantId: string, platformId: string) {
    const platform = await this.findPlatform(restaurantId, platformId);

    return this.prisma.deliveryPlatform.update({
      where: { id: platform.id },
      data: { isActive: !platform.isActive },
    });
  }

  async delete(restaurantId: string, platformId: string) {
    const platform = await this.findPlatform(restaurantId, platformId);
    await this.prisma.deliveryPlatform.delete({ where: { id: platform.id } });
    return { deleted: true };
  }

  async regenerateWebhookSecret(restaurantId: string, platformId: string) {
    const platform = await this.findPlatform(restaurantId, platformId);
    const webhookSecret = this.generateWebhookSecret();

    await this.prisma.deliveryPlatform.update({
      where: { id: platform.id },
      data: { webhookSecret },
    });

    return { webhookSecret };
  }

  async findByWebhookSecret(secret: string) {
    return this.prisma.deliveryPlatform.findFirst({
      where: { webhookSecret: secret, isActive: true },
    });
  }

  private async findPlatform(restaurantId: string, platformId: string) {
    const platform = await this.prisma.deliveryPlatform.findFirst({
      where: { id: platformId, restaurantId },
    });
    if (!platform) throw new NotFoundException('Platform not found');
    return platform;
  }

  private generateWebhookSecret(): string {
    return randomBytes(32).toString('hex');
  }
}
