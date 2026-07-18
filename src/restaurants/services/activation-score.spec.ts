import {
  bandForScore,
  computeActivationScore,
  resolveNextMilestone,
  inferMilestonesFromSignals,
} from './activation-score';

describe('activation-score', () => {
  it('bands thresholds', () => {
    expect(bandForScore(0)).toBe('cold');
    expect(bandForScore(30)).toBe('warming');
    expect(bandForScore(60)).toBe('activated');
    expect(bandForScore(80)).toBe('confident');
  });

  it('computes digital score from channel_live', () => {
    const { score, band } = computeActivationScore('digital', {
      channel_live: '2026-07-17T10:00:00.000Z',
    });
    expect(score).toBe(35);
    expect(band).toBe('warming');
  });

  it('resolves heaviest missing milestone for salon', () => {
    const next = resolveNextMilestone('salon', {});
    expect(next?.id).toBe('guided_ops_proof');
  });

  it('infers milestones from signals', () => {
    const m = inferMilestonesFromSignals({
      firstValueType: 'digital_publish',
      realDishCount: 2,
      teamMemberCount: 2,
    });
    expect(m.channel_live).toBeTruthy();
    expect(m.real_menu_item).toBeTruthy();
    expect(m.team_joined).toBeTruthy();
  });
});
