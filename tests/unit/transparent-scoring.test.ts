import { describe, expect, it } from "vitest";
import { calculateEvidenceScore } from "../../lib/assessment/scoring";

describe("transparent scoring v1", () => {
  it("calculates a 0-5 score from approved evidence strength and confidence", () => {
    expect(calculateEvidenceScore([{ strength: "STRONG", confidence: 1 }, { strength: "MODERATE", confidence: 0.5 }])).toEqual({ score: 4.33, evidenceCount: 2, explanation: "Average of evidence strength weighted by confidence." });
  });
  it("returns no score when there is no approved evidence", () => {
    expect(calculateEvidenceScore([])).toEqual({ score: null, evidenceCount: 0, explanation: "No approved current evidence is available." });
  });
});
