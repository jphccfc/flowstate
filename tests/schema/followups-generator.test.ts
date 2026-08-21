import { afterEach, describe, expect, it, vi } from "vitest";
import { generateFollowUpSuggestions } from "../../lib/ai/followups";

describe("generateFollowUpSuggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns suggested follow-up questions parsed from the Claude response", async () => {
    vi.stubEnv("LITELLM_BASE_URL", "http://litellm.test:4000");
    vi.stubEnv("LITELLM_API_KEY", "gateway-test-key");
    vi.stubEnv("AI_MODEL", "flowstate-test-model");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify([
        "What's driving the night shift labor cost specifically?",
        "Has this been an issue since the extrusion line changes?",
      ]) } }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateFollowUpSuggestions(
      "We are losing money on night shift.",
      ["Shift Scheduling", "Extrusion Process Control"]
    );

    expect(result).toEqual([
      "What's driving the night shift labor cost specifically?",
      "Has this been an issue since the extrusion line changes?",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://litellm.test:4000/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns an empty array when Claude has nothing to suggest", async () => {
    vi.stubEnv("LITELLM_BASE_URL", "http://litellm.test:4000");
    vi.stubEnv("LITELLM_API_KEY", "gateway-test-key");
    vi.stubEnv("AI_MODEL", "flowstate-test-model");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "[]" } }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateFollowUpSuggestions("Unrelated small talk.", []);
    expect(result).toEqual([]);
  });
});
