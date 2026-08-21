import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTagSuggestions, type TaggableEntity } from "../../lib/ai/tagging";

describe("generateTagSuggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns suggestions matched against the candidate list, dropping hallucinated ids", async () => {
    const candidates: TaggableEntity[] = [
      { targetType: "CAPABILITY", targetId: "cap-1", name: "Shift Scheduling" },
      { targetType: "KPI", targetId: "kpi-1", name: "On-time Delivery Rate" },
    ];

    vi.stubEnv("LITELLM_BASE_URL", "http://litellm.test:4000");
    vi.stubEnv("LITELLM_API_KEY", "gateway-test-key");
    vi.stubEnv("AI_MODEL", "flowstate-test-model");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify([
          { targetId: "cap-1", confidence: 0.92 },
          { targetId: "not-a-real-id", confidence: 0.7 },
        ]) } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTagSuggestions(
      "Night shift scheduling is a mess.",
      candidates
    );

    expect(result).toEqual([
      { targetType: "CAPABILITY", targetId: "cap-1", confidence: 0.92 },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://litellm.test:4000/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns an empty array when there are no candidates", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTagSuggestions("Some text.", []);

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
