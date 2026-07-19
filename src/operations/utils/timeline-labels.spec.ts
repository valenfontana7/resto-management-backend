import {
  coordinationCompletedLabel,
  coordinationOpenedLabel,
  coordinationTypeLabel,
  shiftLeadAssignedLabel,
  shiftOpenedRosterDetail,
} from './timeline-labels';

describe('timeline-labels', () => {
  it('traduce tipos de coordinación sin exponer códigos ingleses', () => {
    expect(coordinationTypeLabel('TASK')).toBe('Tarea');
    expect(coordinationTypeLabel('HEADS_UP')).toBe('Aviso');
    expect(coordinationTypeLabel('HELP_REQUEST')).toBe('Ayuda');
    expect(coordinationTypeLabel('APPROVAL')).toBe('Aprobación');
    expect(coordinationTypeLabel('INCIDENT')).toBe('Incidencia');
    expect(coordinationTypeLabel('UNKNOWN')).toBe('Coordinación');
  });

  it('arma el label de apertura sin jerga TASK', () => {
    expect(coordinationOpenedLabel('TASK', 'Verificar impresoras')).toBe(
      'Tarea · Verificar impresoras',
    );
    expect(coordinationOpenedLabel('TASK', 'Abrir caja parcial')).toBe(
      'Tarea · Abrir caja parcial',
    );
  });

  it('usa Encargado en lugar de Lead', () => {
    expect(shiftLeadAssignedLabel()).toBe('Encargado del turno asignado');
    expect(shiftLeadAssignedLabel().toLowerCase()).not.toContain('lead');
  });

  it('humaniza outcomes de coordinación', () => {
    expect(coordinationCompletedLabel('RESOLVED')).toBe(
      'Coordinación resuelta',
    );
    expect(coordinationCompletedLabel('REJECTED')).toBe(
      'Coordinación rechazada',
    );
    expect(coordinationCompletedLabel('weird_code')).toBe(
      'Coordinación resuelta',
    );
  });

  it('describe el roster en español', () => {
    expect(shiftOpenedRosterDetail(3, 'almuerzo')).toBe(
      '3 personas en el equipo · almuerzo',
    );
    expect(shiftOpenedRosterDetail(1, undefined)).toBe(
      '1 persona en el equipo',
    );
  });
});
