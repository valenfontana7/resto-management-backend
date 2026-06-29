import { BENTOO_EVENT_REGISTRY, getEventRegistryEntry } from './event-registry';
import { BentooBusinessEventType } from './event-type.enum';
import { BusinessEventReplayPolicy } from '@prisma/client';

describe('Business Event Registry', () => {
  it('registers all canonical event types', () => {
    const types = Object.values(BentooBusinessEventType);
    expect(Object.keys(BENTOO_EVENT_REGISTRY)).toHaveLength(types.length);
    for (const type of types) {
      expect(BENTOO_EVENT_REGISTRY[type]).toBeDefined();
      expect(BENTOO_EVENT_REGISTRY[type].eventType).toBe(type);
    }
  });

  it('assigns replay policy per event semantics', () => {
    expect(
      getEventRegistryEntry(BentooBusinessEventType.MarketingSkipped)
        .replayPolicy,
    ).toBe(BusinessEventReplayPolicy.SKIP);

    expect(
      getEventRegistryEntry(BentooBusinessEventType.OrderCreated).replayPolicy,
    ).toBe(BusinessEventReplayPolicy.FULL);
  });
});
