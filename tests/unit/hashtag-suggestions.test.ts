import { describe, expect, it } from "vitest";
import { generateHashtagSuggestions } from "@/lib/ai/hashtag-suggestions";

describe("AI hashtag suggestions", () => {
  it("returns a bounded, normalized, de-duplicated set of suggestions", async () => {
    const suggestions = await generateHashtagSuggestions({
      sourceType: "TEXT_NOTE",
      sourceName: "Alexandria meeting notes",
      text: "The Alexandria team agreed that Project Falcon needs an urgent strategy recommendation.",
      vocabulary: ["project-falcon"],
      complete: async () => JSON.stringify([
        { name: "Project Falcon", confidence: 0.93, rationale: "Named project" },
        { name: "#project_falcon", confidence: 0.88, rationale: "Duplicate" },
        { name: "Strategy Recommendation", confidence: 0.76, rationale: "Decision context" },
        { name: "", confidence: 1, rationale: "Invalid" },
        { name: "Too low", confidence: 0.1, rationale: "Low confidence" },
      ]),
    });

    expect(suggestions).toEqual([
      { normalizedName: "project-falcon", displayName: "Project Falcon", confidence: 0.93, rationale: "Named project" },
      { normalizedName: "strategy-recommendation", displayName: "Strategy Recommendation", confidence: 0.76, rationale: "Decision context" },
    ]);
  });
});
