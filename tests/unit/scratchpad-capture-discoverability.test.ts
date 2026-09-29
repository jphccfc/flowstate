import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const scratchpad = readFileSync(resolve(root, "app/clients/[id]/scratchpad/page.tsx"), "utf8");
const capture = readFileSync(resolve(root, "app/clients/[id]/capture/page.tsx"), "utf8");
const richText = readFileSync(resolve(root, "lib/scratchpad/rich-text.ts"), "utf8");

describe("scratchpad capture discoverability", () => {
  it("provides ordered and unordered list formatting while retaining safe pasted list markup", () => {
    expect(scratchpad).toContain('format("insertUnorderedList")');
    expect(scratchpad).toContain('format("insertOrderedList")');
    expect(scratchpad).toContain('format("italic")');
    expect(richText).toContain('"ul", "ol", "li"');
  });

  it("shows recent scratchpad notes in Capture Evidence and opens the selected note", () => {
    expect(capture).toContain('fetch(`/api/scratchpad?organizationId=${organizationId}`)');
    expect(capture).toContain("Recent meeting scratchpad notes");
    expect(capture).toContain("Open scratchpad note");
    expect(capture).toContain("noteId=${encodeURIComponent(note.id)}");
    expect(scratchpad).toContain('searchParams.get("noteId")');
  });

  it("replaces raw technical recent-capture labels with a human-readable title and action", () => {
    expect(capture).toContain("captureTitle");
    expect(capture).toContain("input.subject");
    expect(capture).toContain("input.rawText");
    expect(capture).toContain("Review capture");
  });
});
