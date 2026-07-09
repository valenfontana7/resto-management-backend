import { aggregateNetworkBenchmarks } from './tactic-benchmark.utils';

describe('tactic-benchmark.utils', () => {
  it('requires at least 3 restaurants for network benchmark', () => {
    const result = aggregateNetworkBenchmarks(
      [
        {
          restaurantId: 'a',
          occurrenceCount: 3,
          summary: 'A',
          metadata: { situationType: 'queue_congestion', successRate: 0.8 },
        },
        {
          restaurantId: 'b',
          occurrenceCount: 2,
          summary: 'B',
          metadata: { situationType: 'queue_congestion', successRate: 0.6 },
        },
      ],
      'queue_congestion',
    );
    expect(result).toBeNull();
  });

  it('aggregates median success across restaurants', () => {
    const result = aggregateNetworkBenchmarks(
      [
        {
          restaurantId: 'a',
          occurrenceCount: 3,
          summary: 'A',
          metadata: { situationType: 'queue_congestion', successRate: 0.8 },
        },
        {
          restaurantId: 'b',
          occurrenceCount: 2,
          summary: 'B',
          metadata: { situationType: 'queue_congestion', successRate: 0.6 },
        },
        {
          restaurantId: 'c',
          occurrenceCount: 4,
          summary: 'C',
          metadata: { situationType: 'queue_congestion', successRate: 0.7 },
        },
      ],
      'queue_congestion',
    );
    expect(result?.sampleRestaurants).toBe(3);
    expect(result?.medianSuccessRate).toBe(0.7);
  });
});
