import { describe, expect, it } from "vitest";
import { segmentText } from "../../lib/ai/segmenting";

describe("segmentText", () => {
  it("splits text into ordered segments on blank lines, trimming whitespace", () => {
    const raw = "First paragraph.\n\nSecond paragraph.\n\n\nThird paragraph.";
    expect(segmentText(raw)).toEqual([
      { order: 0, text: "First paragraph." },
      { order: 1, text: "Second paragraph." },
      { order: 2, text: "Third paragraph." },
    ]);
  });

  it("drops empty segments and returns a single segment for text with no blank lines", () => {
    expect(segmentText("Just one line of text.")).toEqual([
      { order: 0, text: "Just one line of text." },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(segmentText("")).toEqual([]);
    expect(segmentText("   \n\n   ")).toEqual([]);
  });
});
