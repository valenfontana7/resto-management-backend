import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanType } from '../dto';
import {
  PlanEntitlementsSnapshot,
  buildSnapshotFromRestrictions,
  buildFallbackSnapshot,
  fallbackGetMinimumPlanForFeature,
  getFallbackRestrictions,
  isUnlimitedLimit,
  parseLimitValue,
  resolveEnforcementFeatureKey,
} from '../constants/plan-restrictions.fallback';

type CachedSnapshot = {
  expires: number;
  snapshot: PlanEntitlementsSnapshot;
};

@Injectable()
export class PlanEntitlementsService {
  private readonly cache = new Map<string, CachedSnapshot>();
  private readonly cacheTtlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  invalidateCache(planId?: string): void {
    if (planId) {
      this.cache.delete(planId);
      return;
    }
    this.cache.clear();
  }

  async getSnapshot(planId: string): Promise<PlanEntitlementsSnapshot> {
    const cached = this.cache.get(planId);
    if (cached && cached.expires > Date.now()) {
      return cached.snapshot;
    }

    let snapshot: PlanEntitlementsSnapshot;

    try {
      const restrictions = await this.prisma.planRestriction.findMany({
        where: { planId },
      });

      if (restrictions.length === 0) {
        snapshot = buildFallbackSnapshot(planId);
      } else {
        snapshot = buildSnapshotFromRestrictions(
          planId,
          restrictions.map((restriction) => ({
            key: restriction.key,
            type: restriction.type as 'limit' | 'boolean' | 'text',
            value: restriction.value,
          })),
        );
      }
    } catch {
      snapshot = buildFallbackSnapshot(planId);
    }

    this.cache.set(planId, {
      expires: Date.now() + this.cacheTtlMs,
      snapshot,
    });

    return snapshot;
  }

  async hasFeature(planId: string, featureKey: string): Promise<boolean> {
    if (featureKey === 'unlimited_products') {
      const limit = await this.getLimit(planId, 'products');
      return isUnlimitedLimit(limit);
    }

    const resolved = resolveEnforcementFeatureKey(featureKey);
    const snapshot = await this.getSnapshot(planId);
    return snapshot.features[resolved] ?? false;
  }

  async getLimit(planId: string, limitKey: string): Promise<number> {
    const snapshot = await this.getSnapshot(planId);

    if (snapshot.limits[limitKey] !== undefined) {
      return snapshot.limits[limitKey];
    }

    const fallback = getFallbackRestrictions(planId).find(
      (restriction) =>
        restriction.type === 'limit' && restriction.key === limitKey,
    );

    return fallback ? parseLimitValue(fallback.value) : 0;
  }

  async getMinimumPlanForFeature(featureKey: string): Promise<PlanType | null> {
    const planOrder: PlanType[] = [
      PlanType.STARTER,
      PlanType.PROFESSIONAL,
      PlanType.ENTERPRISE,
    ];

    for (const plan of planOrder) {
      if (await this.hasFeature(plan, featureKey)) {
        return plan;
      }
    }

    return fallbackGetMinimumPlanForFeature(featureKey);
  }
}
