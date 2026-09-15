export type ReviewerFeedback = {
  id: string;
  organizationId: string;
  reviewReason: string | null;
  correctedDomainName: string | null;
  correctedCapabilityName: string | null;
  title: string;
  summary: string;
  domainName: string | null;
  capabilityName: string | null;
};

function terms(value: string): string[] {
  return value.toLocaleLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
}

export function selectRelevantReviewerFeedback(organizationId: string, question: string, feedback: ReviewerFeedback[], limit = 5): ReviewerFeedback[] {
  const queryTerms = new Set(terms(question));
  if (!queryTerms.size) return [];
  return feedback
    .filter((item) => item.organizationId === organizationId && Boolean(item.reviewReason?.trim()))
    .map((item) => ({ item, score: terms([item.title, item.summary, item.domainName ?? "", item.capabilityName ?? ""].join(" ")).filter((term) => queryTerms.has(term)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, limit)
    .map(({ item }) => item);
}
