import {
  canonicalizeLabIncidents,
  DEFAULT_LAB_INCIDENT_CODES,
} from './lab-incident.types';

describe('canonicalizeLabIncidents', () => {
  it('usa el bundle por defecto cuando no hay input', () => {
    expect(canonicalizeLabIncidents()).toEqual([...DEFAULT_LAB_INCIDENT_CODES]);
    expect(canonicalizeLabIncidents(null)).toEqual([
      ...DEFAULT_LAB_INCIDENT_CODES,
    ]);
  });

  it('canonicaliza aliases y orden estable', () => {
    expect(
      canonicalizeLabIncidents(['stockout', 'kitchen-delay', 'STOCKOUT']),
    ).toEqual(['KITCHEN_DELAY', 'STOCKOUT']);
  });

  it('permite lista vacía explícita', () => {
    expect(canonicalizeLabIncidents([])).toEqual([]);
  });

  it('rechaza códigos desconocidos', () => {
    expect(() => canonicalizeLabIncidents(['chaos'])).toThrow(
      /Incidente Lab no soportado/,
    );
  });
});
