import { describe, expect, it } from "vitest";
import { averageScore, calculateGap, calculateDomainScore } from "../../lib/scoring/engine";

describe("averageScore", () => {
  it("returns null for an empty list", () => {
    expect(averageScore([])).toBeNull();
  });

  it("averages scores across locations", () => {
    expect(averageScore([{ locationTag: "Alexandria", score: 3 }, { locationTag: "Brampton", score: 2 }])).toBe(2.5);
  });

  it("returns the single value for one org-wide entry", () => {
    expect(averageScore([{ locationTag: null, score: 4 }])).toBe(4);
  });
});

describe("calculateGap", () => {
  it("returns null when as-is has no data", () => {
    expect(calculateGap([], [{ locationTag: null, score: 5 }])).toBeNull();
  });

  it("returns null when to-be has no data", () => {
    expect(calculateGap([{ locationTag: null, score: 2 }], [])).toBeNull();
  });

  it("computes a simple org-wide gap", () => {
    expect(calculateGap([{ locationTag: null, score: 2 }], [{ locationTag: null, score: 5 }])).toBe(3);
  });

  it("matches to-be by the same location when both are location-scoped", () => {
    const asIs = [{ locationTag: "Alexandria", score: 3 }, { locationTag: "Brampton", score: 1 }];
    const toBe = [{ locationTag: "Alexandria", score: 4 }, { locationTag: "Brampton", score: 3 }];
    // Alexandria gap 1, Brampton gap 2 -> avg asIs 2, avg matched toBe 3.5 -> gap 1.5
    expect(calculateGap(asIs, toBe)).toBe(1.5);
  });

  it("falls back to the org-wide target when no location-specific target exists", () => {
    const asIs = [{ locationTag: "Brampton", score: 2 }];
    const toBe = [{ locationTag: null, score: 5 }];
    expect(calculateGap(asIs, toBe)).toBe(3);
  });

  it("never returns a negative gap", () => {
    expect(calculateGap([{ locationTag: null, score: 5 }], [{ locationTag: null, score: 2 }])).toBe(0);
  });
});

describe("calculateDomainScore", () => {
  it("weights by importanceScore and skips capabilities missing either side", () => {
    const capabilities = [
      {
        id: "c1",
        name: "Fully Assessed",
        importanceScore: 10,
        asIs: [{ locationTag: null, score: 2 }],
        toBe: [{ locationTag: null, score: 4 }],
      },
      {
        id: "c2",
        name: "Only As-Is",
        importanceScore: 5,
        asIs: [{ locationTag: null, score: 3 }],
        toBe: [],
      },
    ];

    const result = calculateDomainScore(capabilities);

    expect(result.capabilities).toHaveLength(2);
    expect(result.capabilities[0]).toMatchObject({ id: "c1", asIsScore: 2, toBeScore: 4, gapScore: 2 });
    expect(result.capabilities[1]).toMatchObject({ id: "c2", asIsScore: 3, toBeScore: null, gapScore: null });
    // Only c1 is fully scored, so domain averages come from c1 alone
    expect(result.averageAsIs).toBe(2);
    expect(result.averageToBe).toBe(4);
    expect(result.averageGap).toBe(2);
  });

  it("returns zeros when no capability has both sides scored", () => {
    const result = calculateDomainScore([
      { id: "c1", name: "Unscored", importanceScore: 5, asIs: [], toBe: [] },
    ]);
    expect(result.averageAsIs).toBe(0);
    expect(result.averageToBe).toBe(0);
    expect(result.averageGap).toBe(0);
  });
});
