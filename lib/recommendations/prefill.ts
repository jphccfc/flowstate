export type RecommendationPrefill = { title: string; description: string; priorityScore: number };

export function buildRecommendationPrefill(capabilityName: string, domainName: string, gap: number, asIs: number | null, toBe: number | null): RecommendationPrefill {
  return {
    title: `Improve ${capabilityName}`,
    description: `Address the ${domainName} capability gap for ${capabilityName}. Current maturity: ${asIs ?? "—"}/5. Target maturity: ${toBe ?? "—"}/5. Identified gap: ${gap.toFixed(1)}.`,
    priorityScore: Math.min(100, Math.max(0, Math.round(gap * 20))),
  };
}

export function recommendationHref(organizationId: string, prefill: RecommendationPrefill): string {
  const query = new URLSearchParams({ ...prefill, priorityScore: String(prefill.priorityScore) });
  return `/clients/${organizationId}/recommendations?${query.toString()}`;
}
