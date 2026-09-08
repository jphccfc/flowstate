import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const review = readFileSync(resolve(root, "app/clients/[id]/review/page.tsx"), "utf8");
const scratchpad = readFileSync(resolve(root, "app/clients/[id]/scratchpad/page.tsx"), "utf8");

 describe("Scratch Pad human review workflow", () => {
  it("links Scratch Pad users to the organization review destination", () => {
    expect(scratchpad).toContain("Review Scratch Pad notes");
    expect(scratchpad).toContain("/clients/${organizationId}/review");
  });

  it("renders raw notes through the existing rich-text sanitizer and keeps tag review independent", () => {
    expect(review).toContain('import { sanitizeRichText } from "@/lib/scratchpad/rich-text";');
    expect(review).toContain("sanitizeRichText(note.rawText ?? \"\")");
    expect(review).toContain("/api/scratchpad?organizationId=${organizationId}");
    expect(review).toContain("Scratch Pad notes");
    expect(review).toContain("Raw / provisional");
    expect(review).toContain("meetingContext?.title");
    expect(review).toContain("setTags(await tagsResult.value.json())");
    expect(review).toContain("setScratchpadNotes(await notesResult.value.json())");
  });

  it("does not render Scratch Pad note HTML with an unsanitized HTML sink", () => {
    expect(review).not.toContain("dangerouslySetInnerHTML={{ __html: note.rawText");
    expect(review).not.toContain("note.rawText?.replace(/<[^>]*>/g, \"\")");
  });
});
