import { describe, expect, it } from "vitest";
import { buildRecommendationPrefill, recommendationHref } from "../../lib/recommendations/prefill";

describe("recommendation prefill", () => {
  it("builds a useful draft from a priority gap", () => {
    expect(buildRecommendationPrefill("Data Governance", "Operations", 3.5, 1.5, 5)).toEqual({
      title: "Improve Data Governance",
      description: "Address the Operations capability gap for Data Governance. Current maturity: 1.5/5. Target maturity: 5/5. Identified gap: 3.5.",
      priorityScore: 70,
    });
  });

  it("encodes the prefill in the recommendation route", () => {
    const href = recommendationHref("client-1", buildRecommendationPrefill("Data Governance", "Operations", 3.5, 1.5, 5));
    expect(href).toContain("/clients/client-1/recommendations?");
    expect(href).toContain("title=Improve+Data+Governance");
    expect(href).toContain("priorityScore=70");
  });
});
