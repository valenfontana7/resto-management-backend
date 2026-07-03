import { Injectable } from '@nestjs/common';
import { OpportunitySensorService } from '../sensing/opportunity-sensor.service';
import type {
  OpportunityFeedDto,
  OpportunitySignal,
  OpportunitySignalType,
} from '../types/commercial-intelligence.types';

@Injectable()
export class OpportunityFeedService {
  private cachedFeed: OpportunityFeedDto | null = null;
  private cachedAt = 0;
  private readonly cacheTtlMs = 60_000;
  private reactiveSignals: OpportunitySignal[] = [];

  constructor(private readonly sensor: OpportunitySensorService) {}

  invalidateCache(): void {
    this.cachedAt = 0;
    this.cachedFeed = null;
  }

  pushReactiveSignal(signal: OpportunitySignal): void {
    this.reactiveSignals.unshift(signal);
    this.reactiveSignals = this.reactiveSignals.slice(0, 10);
    this.invalidateCache();
  }

  async getFeed(limit = 20): Promise<OpportunityFeedDto> {
    const now = Date.now();
    if (this.cachedFeed && now - this.cachedAt < this.cacheTtlMs) {
      return {
        ...this.cachedFeed,
        signals: this.cachedFeed.signals.slice(0, limit),
      };
    }

    const scanned = await this.sensor.detectAll();
    const merged = this.mergeSignals([...this.reactiveSignals, ...scanned]);
    const limited = merged.slice(0, Math.max(limit, 30));

    const byType: Partial<Record<OpportunitySignalType, number>> = {};
    let critical = 0;
    let high = 0;

    for (const signal of limited) {
      byType[signal.type] = (byType[signal.type] ?? 0) + 1;
      if (signal.severity === 'critical') critical += 1;
      if (signal.severity === 'high') high += 1;
    }

    const dto: OpportunityFeedDto = {
      signals: limited.slice(0, limit),
      summary: {
        total: Math.min(limited.length, limit),
        critical,
        high,
        byType,
      },
      generatedAt: new Date().toISOString(),
    };

    this.cachedFeed = dto;
    this.cachedAt = now;
    return dto;
  }

  private mergeSignals(signals: OpportunitySignal[]): OpportunitySignal[] {
    const byKey = new Map<string, OpportunitySignal>();
    for (const signal of signals) {
      const key = signal.leadId ? `${signal.type}:${signal.leadId}` : signal.id;
      const existing = byKey.get(key);
      if (!existing || signal.priority > existing.priority) {
        byKey.set(key, signal);
      }
    }
    return [...byKey.values()].sort((a, b) => b.priority - a.priority);
  }
}
