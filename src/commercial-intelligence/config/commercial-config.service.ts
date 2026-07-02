import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_CI_CONFIG,
  type CommercialIntelligenceConfigData,
} from '../types/commercial-intelligence.types';

@Injectable()
export class CommercialConfigService implements OnModuleInit {
  private cached: CommercialIntelligenceConfigData | null = null;
  private cachedVersion = 0;
  private cachedAt = 0;
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultConfig();
  }

  async getActive(): Promise<
    CommercialIntelligenceConfigData & { version: number }
  > {
    const now = Date.now();
    if (this.cached && now - this.cachedAt < this.ttlMs) {
      return { ...this.cached, version: this.cachedVersion };
    }

    const row = await this.prisma.commercialIntelligenceConfig.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!row) {
      await this.ensureDefaultConfig();
      return this.getActive();
    }

    this.cached = this.parseRow(row);
    this.cachedVersion = row.version;
    this.cachedAt = now;
    return { ...this.cached, version: row.version };
  }

  invalidateCache(): void {
    this.cached = null;
    this.cachedAt = 0;
  }

  private parseRow(row: {
    weights: unknown;
    segments: unknown;
    signals: unknown;
    thresholds: unknown;
  }): CommercialIntelligenceConfigData {
    return {
      weights: row.weights as CommercialIntelligenceConfigData['weights'],
      segments: row.segments as CommercialIntelligenceConfigData['segments'],
      signals: row.signals as CommercialIntelligenceConfigData['signals'],
      thresholds:
        row.thresholds as CommercialIntelligenceConfigData['thresholds'],
    };
  }

  private async ensureDefaultConfig(): Promise<void> {
    const existing = await this.prisma.commercialIntelligenceConfig.findFirst({
      where: { isActive: true },
    });
    if (existing) return;

    await this.prisma.commercialIntelligenceConfig.create({
      data: {
        version: 1,
        isActive: true,
        weights: DEFAULT_CI_CONFIG.weights as unknown as Prisma.InputJsonValue,
        segments:
          DEFAULT_CI_CONFIG.segments as unknown as Prisma.InputJsonValue,
        signals: DEFAULT_CI_CONFIG.signals as unknown as Prisma.InputJsonValue,
        thresholds:
          DEFAULT_CI_CONFIG.thresholds as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
