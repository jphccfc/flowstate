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
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewAgentKey?: string | null;
  reviewPromptVersion?: number | null;
  sourceRef?: string | null;
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

export function formatReviewerFeedbackContext(feedback: ReviewerFeedback[]): string {
  if (!feedback.length) return "";
  return `\n\nRelevant reviewer corrections (guidance only; not source evidence; apply only to matching context):\n${feedback.map((item) => `- Similar evidence: ${item.title}. Reviewer guidance: ${item.reviewReason}${item.correctedDomainName ? ` Correct domain: ${item.correctedDomainName}.` : ""}${item.correctedCapabilityName ? ` Correct capability: ${item.correctedCapabilityName}.` : ""} Provenance: source ${item.sourceRef ?? "unknown"}; reviewer ${item.reviewedBy ?? "unknown"}; decision ${item.reviewedAt ?? "unknown"}; agent ${item.reviewAgentKey ?? "unknown"} v${item.reviewPromptVersion ?? "unknown"}.`).join("\n")}`;
}
