import {
  buildScoringInputFromLead,
  calculateLeadScore,
  getLeadPriority,
  type LeadScoringInput,
} from './lead-scoring.rules';

describe('lead-scoring.rules', () => {
  const base: LeadScoringInput = {
    hasWebsite: true,
    hasOnlineMenu: true,
    hasReservations: true,
    hasWhatsapp: false,
    hasInstagram: false,
    branchCount: 1,
  };

  it('returns 0 for fully digital single-branch lead', () => {
    expect(calculateLeadScore(base)).toBe(0);
  });

  it('adds 40 when no website', () => {
    expect(calculateLeadScore({ ...base, hasWebsite: false })).toBe(40);
  });

  it('sums all rules and caps at 100', () => {
    const score = calculateLeadScore({
      hasWebsite: false,
      hasOnlineMenu: false,
      hasReservations: false,
      hasWhatsapp: true,
      hasInstagram: true,
      branchCount: 3,
    });
    expect(score).toBe(100);
  });

  it('classifies priority bands', () => {
    expect(getLeadPriority(10)).toBe('low');
    expect(getLeadPriority(45)).toBe('medium');
    expect(getLeadPriority(80)).toBe('high');
  });

  it('derives instagram from lead field', () => {
    const input = buildScoringInputFromLead({
      ...base,
      instagram: '@test',
    });
    expect(input.hasInstagram).toBe(true);
  });
});
