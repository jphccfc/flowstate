import { describe, expect, it } from "vitest";
import { displayHashtag, normalizeHashtag } from "@/lib/tags/hashtags";

describe("hashtag normalization", () => {
  it("converts equivalent human input to one canonical tag", () => {
    expect(normalizeHashtag("#Project Falcon")).toBe("project-falcon");
    expect(normalizeHashtag("project_falcon")).toBe("project-falcon");
    expect(displayHashtag(" Project Falcon ")).toBe("#project-falcon");
  });

  it("rejects empty or oversized values", () => {
    expect(() => normalizeHashtag("###")).toThrow("letters or numbers");
    expect(() => normalizeHashtag("a".repeat(81))).toThrow("80 characters");
  });
});
