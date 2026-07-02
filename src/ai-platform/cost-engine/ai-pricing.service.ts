import { Injectable, NotFoundException } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAiPricingDto, UpdateAiPricingDto } from '../dto/ai-pricing.dto';

@Injectable()
export class AiPricingService {
  constructor(private readonly prisma: PrismaService) {}

  list(provider?: AiProvider) {
    return this.prisma.aiModelPricing.findMany({
      where: provider ? { provider } : undefined,
      orderBy: [
        { provider: 'asc' },
        { model: 'asc' },
        { effectiveFrom: 'desc' },
      ],
    });
  }

  create(dto: CreateAiPricingDto) {
    return this.prisma.aiModelPricing.create({
      data: {
        provider: dto.provider,
        model: dto.model,
        inputPerMillion: dto.inputPerMillion,
        outputPerMillion: dto.outputPerMillion,
        reasoningPerMillion: dto.reasoningPerMillion,
        currency: dto.currency ?? 'USD',
      },
    });
  }

  async update(id: string, dto: UpdateAiPricingDto) {
    await this.ensureExists(id);
    return this.prisma.aiModelPricing.update({
      where: { id },
      data: dto,
    });
  }

  async deactivate(id: string) {
    await this.ensureExists(id);
    return this.prisma.aiModelPricing.update({
      where: { id },
      data: { isActive: false, effectiveTo: new Date() },
    });
  }

  private async ensureExists(id: string) {
    const row = await this.prisma.aiModelPricing.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pricing no encontrado');
  }
}
