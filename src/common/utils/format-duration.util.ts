export type DurationFormatStyle = 'long' | 'short';

function pluralizeEs(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/**
 * Formatea una duración en minutos.
 * Hasta 59 min se muestra en minutos; desde 60 min pasa a horas (y minutos restantes si aplica).
 */
export function formatDurationMinutes(
  totalMinutes: number,
  style: DurationFormatStyle = 'long',
): string {
  const minutes = Math.max(0, Math.round(totalMinutes));

  if (minutes < 60) {
    if (style === 'short') {
      return `${minutes} min`;
    }
    return `${minutes} ${pluralizeEs(minutes, 'minuto', 'minutos')}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (style === 'short') {
    const hourPart = `${hours} h`;
    return remainingMinutes > 0
      ? `${hourPart} ${remainingMinutes} min`
      : hourPart;
  }

  const hourPart = `${hours} ${pluralizeEs(hours, 'hora', 'horas')}`;
  if (remainingMinutes === 0) return hourPart;
  return `${hourPart} ${remainingMinutes} ${pluralizeEs(remainingMinutes, 'minuto', 'minutos')}`;
}
