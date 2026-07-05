import type { Lead } from '@prisma/client';

type LeadWithCommercialRelation = Lead & {
  commercialRelation?: { id: string } | null;
};

export function withRevenueRelationId<T extends LeadWithCommercialRelation>(
  lead: T,
): Omit<T, 'commercialRelation'> & { revenueRelationId: string | null } {
  const { commercialRelation, ...rest } = lead;
  return {
    ...rest,
    revenueRelationId: commercialRelation?.id ?? null,
  };
}
