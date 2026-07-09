import { projectTacticSimulation } from './tactic-simulation.utils';

describe('tactic-simulation.utils', () => {
  it('projects median delta for matching episodes', () => {
    const projection = projectTacticSimulation({
      situationType: 'queue_congestion',
      tacticSummary: 'pausar delivery',
      episodes: [
        {
          situationType: 'queue_congestion',
          outcome: {
            summary: 'Pausar delivery 30 min',
            measuredImpact: {
              metric: 'prep_time',
              valueBefore: 40,
              valueAfter: 32,
              unit: 'min',
            },
          },
          closedAt: new Date('2026-07-04T21:00:00'),
        },
        {
          situationType: 'queue_congestion',
          outcome: {
            summary: 'Pausar delivery',
            measuredImpact: {
              metric: 'prep_time',
              valueBefore: 38,
              valueAfter: 30,
              unit: 'min',
            },
          },
          closedAt: new Date('2026-07-11T21:00:00'),
        },
      ],
    });

    expect(projection.matchedEpisodes).toBe(2);
    expect(projection.medianDelta).toBe(-8);
    expect(projection.narrative).toContain('Impacto mediano');
  });
});
