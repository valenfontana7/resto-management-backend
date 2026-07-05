import { describe, expect, it } from '@jest/globals';
import { PersonalizationEngine } from './services/personalization-engine.service';
import { EngagementPolicyRegistry } from './policies/engagement-policy.registry';
import { getPolicyForRecommendationCode } from './catalog/engagement-policy-catalog.loader';
import { findTemplate } from './catalog/template-catalog.loader';
import { findJourneyByRecommendationCode } from './catalog/journey-catalog.loader';
import type { DetectedRecommendation } from '../decision-engine/recommendations/types/recommendation.types';
import type { RestaurantSuccessSnapshot } from '../decision-engine/rss/types/restaurant-success-snapshot.types';
import type { EngagementPersistenceService } from './stores/engagement-persistence.service';
import type { ActiveJourneyService } from './services/active-journey.service';

describe('Customer Engagement Engine', () => {
  it('carga catálogos de policy, journey y template', () => {
    expect(getPolicyForRecommendationCode('REC-PUB-01')?.id).toBe('POL-ACT-02');
    expect(findJourneyByRecommendationCode('REC-PUB-01')?.id).toBe('J-ACT-02');
    expect(
      findTemplate({
        trigger: 'activation.publish_site',
        recommendationCode: 'REC-PUB-01',
        channel: 'email',
      })?.id,
    ).toBe('TPL-ACT-PUB-01');
  });

  it('personaliza template sin concatenar strings manualmente', () => {
    const engine = new PersonalizationEngine();
    const template = findTemplate({
      recommendationCode: 'REC-PUB-01',
      channel: 'email',
    });
    expect(template).toBeTruthy();

    const message = engine.render(template!, 'email', {
      restaurantId: 'r1',
      restaurantName: 'La Parrilla',
      restaurantSlug: 'la-parrilla',
      ownerName: 'Juan Pérez',
      ownerEmail: 'juan@test.com',
      ownerUserId: 'user-1',
      ownerPhone: '+5491112345678',
      firstName: 'Juan',
      adminUrl: 'https://bentoo.com.ar/admin',
      ctaUrl: 'https://bentoo.com.ar/admin',
      daysInactive: null,
      tenureDays: 3,
      rss: 42,
      rssBand: 'attention',
      rssDelta7d: -5,
      topRecommendationTitle: 'Publicar tu sitio',
      primaryJob: 'Presencia digital propia',
      expectedOutcome: 'Canal propio visible',
    });

    expect(message.body).toContain('La Parrilla');
    expect(message.body).toContain('Juan');
    expect(message.subject).toContain('La Parrilla');
  });

  it('policy evalúa frequency cap desde REC (no eventos)', async () => {
    const persistence = {
      listRecentDeliveries: async () => [],
      daysSinceLastDeliveryForRecommendation: async () => null,
    } as unknown as EngagementPersistenceService;

    const activeJourneys = {
      hasActiveRiskJourney: async () => false,
    } as unknown as ActiveJourneyService;

    const registry = new EngagementPolicyRegistry(persistence, activeJourneys);
    const policy = getPolicyForRecommendationCode('REC-PUB-01')!;

    const recommendation = {
      code: 'REC-PUB-01',
      priority: 'high',
      recommendedJourneyType: 'activation',
    } as DetectedRecommendation;

    const snapshot = {
      restaurantId: 'r1',
      rss: {
        band: 'attention',
        value: 40,
        delta7d: 0,
        delta30d: null,
        trend7d: null,
        bandLabel: 'Atención',
      },
      metadata: { tenureDays: 5 },
    } as RestaurantSuccessSnapshot;

    const context = await registry.buildEvaluationContext(
      'r1',
      'REC-PUB-01',
      policy,
    );
    const decision = await registry.evaluate({
      recommendation,
      snapshot,
      policy,
      context,
    });

    expect(decision.shouldCommunicate).toBe(true);
    expect(decision.policyId).toBe('POL-ACT-02');
  });
});
