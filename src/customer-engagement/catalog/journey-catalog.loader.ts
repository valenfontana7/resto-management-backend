import journeysCatalogJson from './journeys.v1.json';
import type { JourneyDefinition } from '../types/journey.types';

interface JourneyCatalogFile {
  version: string;
  journeys: Record<string, JourneyDefinition>;
}

const catalog = journeysCatalogJson as JourneyCatalogFile;

export function loadJourneyCatalog(): JourneyCatalogFile {
  return catalog;
}

export function getJourneyById(id: string): JourneyDefinition | null {
  return catalog.journeys[id] ?? null;
}

export function findJourneyByRecommendationCode(
  code: string,
): JourneyDefinition | null {
  return (
    Object.values(catalog.journeys).find((j) =>
      j.linkedRecommendationCodes.includes(code),
    ) ?? null
  );
}

export function listJourneys(): JourneyDefinition[] {
  return Object.values(catalog.journeys);
}
