import { describe, expect, it } from "vitest";
import { selectRelevantReviewerFeedback } from "../../lib/ai/feedback";

describe("FlowCoach reviewer feedback reuse", () => {
  const feedback = [
    { id: "a", organizationId: "org-1", reviewReason: "Use Acquisition, not Operations", correctedDomainName: "Acquisition", correctedCapabilityName: null, title: "Indicative Offer", summary: "Offer document", domainName: "Operations", capabilityName: null },
    { id: "b", organizationId: "org-1", reviewReason: "Use Finance", correctedDomainName: "Finance", correctedCapabilityName: null, title: "Payroll policy", summary: "Payroll", domainName: "People", capabilityName: null },
    { id: "c", organizationId: "org-2", reviewReason: "Do not apply elsewhere", correctedDomainName: "Other", correctedCapabilityName: null, title: "Offer", summary: "Offer", domainName: "Other", capabilityName: null },
  ];

  it("returns relevant feedback only from the authorized organization", () => {
    const result = selectRelevantReviewerFeedback("org-1", "What domain should an indicative offer document use?", feedback);
    expect(result.map((item) => item.id)).toEqual(["a"]);
    expect(result[0].reviewReason).toContain("Acquisition");
  });

  it("does not invent feedback when no reviewed reason exists", () => {
    expect(selectRelevantReviewerFeedback("org-1", "unrelated topic", feedback)).toEqual([]);
  });
});
