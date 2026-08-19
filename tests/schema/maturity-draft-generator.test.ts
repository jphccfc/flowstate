import { afterEach, describe, expect, it, vi } from "vitest";
import { draftAsIsScore, draftToBeScore } from "../../lib/ai/maturity-draft";

describe("draftAsIsScore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses a score and evidence from the Claude response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 2, evidence: "Manual, ad hoc process." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await draftAsIsScore("Shift Scheduling", ["We schedule shifts on a whiteboard."]);
    expect(result).toEqual({ score: 2, evidence: "Manual, ad hoc process." });
    expect(mockFetch).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("We schedule shifts on a whiteboard.");
  });

  it("clamps an out-of-range score into 0-5", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: JSON.stringify({ score: 9, evidence: "x" }) }] }) }));
    const result = await draftAsIsScore("X", []);
    expect(result.score).toBe(5);
  });

  it("returns score 0 and empty evidence on unparseable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "not json" }] }) }));
    expect(await draftAsIsScore("X", [])).toEqual({ score: 0, evidence: "" });
  });
});

describe("draftToBeScore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes engagement motive and KPI targets in the prompt", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 4, rationale: "Growth target." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await draftToBeScore("Shift Scheduling", "Growth", ["On-time delivery: 95%"]);
    expect(result).toEqual({ score: 4, rationale: "Growth target." });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("Growth");
    expect(body.messages[0].content).toContain("On-time delivery: 95%");
  });

  it("returns score 0 and empty rationale on unparseable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "not json" }] }) }));
    expect(await draftToBeScore("X", null, [])).toEqual({ score: 0, rationale: "" });
  });
});
