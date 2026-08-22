import { describe, expect, it } from "vitest";
import { DEFAULT_MATURITY_RUBRIC, summarisePerspectiveScores } from "@/lib/maturity/rubric";

describe("maturity rubric", () => {
  it("defines versioned 0-5 anchors including absent and leading", () => {
    expect(DEFAULT_MATURITY_RUBRIC.version).toBe(1);
    expect(DEFAULT_MATURITY_RUBRIC.anchors).toHaveLength(6);
    expect(DEFAULT_MATURITY_RUBRIC.anchors[0].level).toBe(0);
    expect(DEFAULT_MATURITY_RUBRIC.anchors[5].label).toBe("Leading");
  });

  it("summarises fractional perspective scores without averaging them away", () => {
    expect(summarisePerspectiveScores([1, 0.5])).toEqual({ count: 2, minimum: 0.5, maximum: 1, spread: 0.5 });
  });
});
