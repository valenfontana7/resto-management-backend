export interface DecisionExplanation {
  score: {
    value: number;
    band: string;
    delta7d: number | null;
    headline: string;
  };
  whyNow: {
    factors: {
      signalCode: string;
      label: string;
      direction: 'positive' | 'negative';
      weight: string;
    }[];
  };
  whatToDo: {
    primaryRecommendationCode: string | null;
    alternatives: string[];
  };
  trace: {
    signalIds: string[];
    opportunityIds: string[];
    recommendationIds: string[];
    rulesApplied: string[];
    principles: string[];
  };
}
