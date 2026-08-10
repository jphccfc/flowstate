import { afterEach, describe, expect, it, vi } from "vitest";
import { generateFollowUpSuggestions } from "../../lib/ai/followups";

describe("generateFollowUpSuggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns suggested follow-up questions parsed from the Claude response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        content: [
          {
            text: JSON.stringify([
              "What's driving the night shift labor cost specifically?",
              "Has this been an issue since the extrusion line changes?",
            ]),
          },
        ],
      }),
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
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns an empty array when Claude has nothing to suggest", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: "[]" }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateFollowUpSuggestions("Unrelated small talk.", []);
    expect(result).toEqual([]);
  });
});
