import { describe, expect, it } from "vitest";
import { selectRelevantReviewerFeedback, formatReviewerFeedbackContext, type ReviewerFeedback } from "../../lib/ai/feedback";

describe("FlowCoach reviewer feedback reuse", () => {
  const feedback: ReviewerFeedback[] = [
    { id: "a", organizationId: "org-1", reviewReason: "Use Acquisition, not Operations", correctedDomainName: "Acquisition", correctedCapabilityName: null, title: "Indicative Offer", summary: "Offer document", domainName: "Operations", capabilityName: null, reviewedBy: "reviewer@example.com", reviewedAt: "2026-09-15T10:00:00.000Z", reviewAgentKey: "client_ai_hub", reviewPromptVersion: 2, sourceRef: "sharepoint:item-a" },
    { id: "b", organizationId: "org-1", reviewReason: "Use Finance", correctedDomainName: "Finance", correctedCapabilityName: null, title: "Payroll policy", summary: "Payroll", domainName: "People", capabilityName: null, reviewedBy: "reviewer@example.com", reviewedAt: "2026-09-15T10:00:00.000Z", reviewAgentKey: "client_ai_hub", reviewPromptVersion: 2, sourceRef: "sharepoint:item-b" },
    { id: "c", organizationId: "org-2", reviewReason: "Do not apply elsewhere", correctedDomainName: "Other", correctedCapabilityName: null, title: "Offer", summary: "Offer", domainName: "Other", capabilityName: null, reviewedBy: "other@example.com", reviewedAt: null, reviewAgentKey: "client_ai_hub", reviewPromptVersion: 2, sourceRef: null },
  ];

  it("returns relevant feedback only from the authorized organization", () => {
    const result = selectRelevantReviewerFeedback("org-1", "What domain should an indicative offer document use?", feedback);
    expect(result.map((item) => item.id)).toEqual(["a"]);
    expect(result[0].reviewReason).toContain("Acquisition");
  });

  it("does not invent feedback when no reviewed reason exists", () => {
    expect(selectRelevantReviewerFeedback("org-1", "unrelated topic", feedback)).toEqual([]);
  });

  it("formats provenance without turning feedback into source evidence", () => {
    const context = formatReviewerFeedbackContext([feedback[0]]);
    expect(context).toContain("reviewer@example.com");
    expect(context).toContain("client_ai_hub v2");
    expect(context).toContain("sharepoint:item-a");
    expect(context).toContain("guidance only");
  });
});
