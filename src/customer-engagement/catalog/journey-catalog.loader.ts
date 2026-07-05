import { readFileSync } from 'fs';
import { join } from 'path';
import type { JourneyDefinition } from '../types/journey.types';

interface JourneyCatalogFile {
  version: string;
  journeys: Record<string, JourneyDefinition>;
}

let cached: JourneyCatalogFile | null = null;

export function loadJourneyCatalog(): JourneyCatalogFile {
  if (cached) return cached;
  const path = join(__dirname, 'journeys.v1.json');
  cached = JSON.parse(readFileSync(path, 'utf-8')) as JourneyCatalogFile;
  return cached;
}

export function getJourneyById(id: string): JourneyDefinition | null {
  return loadJourneyCatalog().journeys[id] ?? null;
}

export function findJourneyByRecommendationCode(
  code: string,
): JourneyDefinition | null {
  const catalog = loadJourneyCatalog();
  return (
    Object.values(catalog.journeys).find((j) =>
      j.linkedRecommendationCodes.includes(code),
    ) ?? null
  );
}

export function listJourneys(): JourneyDefinition[] {
  return Object.values(loadJourneyCatalog().journeys);
}
