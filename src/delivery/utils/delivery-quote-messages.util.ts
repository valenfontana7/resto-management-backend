type ZoneSummary = {
  name: string;
  areas: string[];
};

export function buildDeliveryQuoteFailureMessage(options: {
  matchedBy: 'none' | 'out-of-zone' | 'zoneId';
  zones: ZoneSummary[];
  hasAddress: boolean;
}): { message: string; requiresZoneSelection: boolean } {
  const { matchedBy, zones, hasAddress } = options;

  if (matchedBy === 'out-of-zone') {
    const coverage = [
      ...new Set(
        zones.flatMap((zone) => [zone.name, ...zone.areas]).filter(Boolean),
      ),
    ];

    const coverageText =
      coverage.length > 0
        ? ` Cubrimos: ${coverage.slice(0, 5).join(', ')}${coverage.length > 5 ? '…' : ''}.`
        : '';

    return {
      message: `Esta dirección queda fuera de nuestra zona de entrega.${coverageText}`,
      requiresZoneSelection: false,
    };
  }

  if (zones.length > 1) {
    return {
      message: hasAddress
        ? 'No pudimos ubicar tu dirección automáticamente. Seleccioná la zona de entrega.'
        : 'Seleccioná una zona de entrega válida para calcular el envío.',
      requiresZoneSelection: true,
    };
  }

  return {
    message:
      'No se pudo resolver una zona de delivery válida para esta dirección.',
    requiresZoneSelection: false,
  };
}
