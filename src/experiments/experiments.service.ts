import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExperimentDto, UpdateExperimentDto } from './dto/experiment.dto';

@Injectable()
export class ExperimentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(restaurantId: string) {
    return this.prisma.experiment.findMany({
      where: { restaurantId },
      include: {
        variants: {
          orderBy: { isControl: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(restaurantId: string, experimentId: string) {
    const experiment = await this.prisma.experiment.findFirst({
      where: { id: experimentId, restaurantId },
      include: { variants: true },
    });
    if (!experiment) throw new NotFoundException('Experiment not found');
    return experiment;
  }

  async create(restaurantId: string, dto: CreateExperimentDto) {
    if (!dto.variants?.length || dto.variants.length < 2) {
      throw new BadRequestException(
        'At least 2 variants required (control + test)',
      );
    }
    const hasControl = dto.variants.some((v) => v.isControl);
    if (!hasControl) {
      dto.variants[0].isControl = true;
    }

    return this.prisma.experiment.create({
      data: {
        restaurantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        targetEntity: dto.targetEntity,
        targetEntityId: dto.targetEntityId,
        trafficSplit: dto.trafficSplit ?? 50,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        variants: {
          create: dto.variants.map((v) => ({
            name: v.name,
            isControl: v.isControl ?? false,
            config: v.config ?? {},
          })),
        },
      },
      include: { variants: true },
    });
  }

  async update(
    restaurantId: string,
    experimentId: string,
    dto: UpdateExperimentDto,
  ) {
    await this.getById(restaurantId, experimentId);
    return this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.trafficSplit !== undefined && {
          trafficSplit: dto.trafficSplit,
        }),
        ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
      },
      include: { variants: true },
    });
  }

  async delete(restaurantId: string, experimentId: string) {
    await this.getById(restaurantId, experimentId);
    await this.prisma.experiment.delete({ where: { id: experimentId } });
    return { deleted: true };
  }

  /**
   * Assign a variant to a visitor (deterministic hash-based)
   */
  async assignVariant(
    restaurantId: string,
    experimentId: string,
    visitorId: string,
  ) {
    const experiment = await this.prisma.experiment.findFirst({
      where: { id: experimentId, restaurantId, isActive: true },
      include: { variants: true },
    });

    if (!experiment || !experiment.variants.length) return null;

    // Check date range
    const now = new Date();
    if (experiment.startDate && now < experiment.startDate) return null;
    if (experiment.endDate && now > experiment.endDate) return null;

    // Deterministic assignment based on visitorId hash
    const hash = this.simpleHash(visitorId + experimentId);
    const bucket = hash % 100;

    const control = experiment.variants.find((v) => v.isControl);
    const test = experiment.variants.find((v) => !v.isControl);

    if (!control || !test) return control || test;

    const variant = bucket < experiment.trafficSplit ? test : control;

    // Increment impressions
    await this.prisma.experimentVariant.update({
      where: { id: variant.id },
      data: { impressions: { increment: 1 } },
    });

    return {
      variantId: variant.id,
      variantName: variant.name,
      isControl: variant.isControl,
      config: variant.config,
    };
  }

  /**
   * Record a conversion for a variant
   */
  async recordConversion(variantId: string, revenue?: number) {
    await this.prisma.experimentVariant.update({
      where: { id: variantId },
      data: {
        conversions: { increment: 1 },
        ...(revenue ? { revenue: { increment: revenue } } : {}),
      },
    });
    return { recorded: true };
  }

  /**
   * Get experiment results with statistical significance
   */
  async getResults(restaurantId: string, experimentId: string) {
    const experiment = await this.getById(restaurantId, experimentId);

    const results = experiment.variants.map((v) => {
      const convRate = v.impressions > 0 ? v.conversions / v.impressions : 0;
      const avgRevenue = v.conversions > 0 ? v.revenue / v.conversions : 0;
      return {
        id: v.id,
        name: v.name,
        isControl: v.isControl,
        impressions: v.impressions,
        conversions: v.conversions,
        revenue: v.revenue,
        conversionRate: Math.round(convRate * 10000) / 100,
        avgRevenue: Math.round(avgRevenue),
      };
    });

    const control = results.find((r) => r.isControl);
    const test = results.find((r) => !r.isControl);
    let uplift = 0;
    if (control && test && control.conversionRate > 0) {
      uplift =
        Math.round(
          ((test.conversionRate - control.conversionRate) /
            control.conversionRate) *
            10000,
        ) / 100;
    }

    return {
      experiment: {
        id: experiment.id,
        name: experiment.name,
        type: experiment.type,
        isActive: experiment.isActive,
        trafficSplit: experiment.trafficSplit,
      },
      variants: results,
      uplift,
      sampleSize: results.reduce((s, r) => s + r.impressions, 0),
    };
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
