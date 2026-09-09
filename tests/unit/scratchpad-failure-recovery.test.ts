import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const scratchpad = readFileSync(resolve(root, "app/clients/[id]/scratchpad/page.tsx"), "utf8");
const review = readFileSync(resolve(root, "app/clients/[id]/review/page.tsx"), "utf8");

describe("Scratch Pad failure recovery contract", () => {
  it("surfaces the API error while retaining the local draft", () => {
    expect(scratchpad).toContain("localStorage.setItem(cacheKey, safe)");
    expect(scratchpad).toContain("Save failed: ${message}");
    expect(scratchpad).toContain("role=\"alert\"");
    expect(scratchpad).toContain("fetch(scratchpadQuery).then(async r =>");
    expect(scratchpad).not.toContain("fetch(scratchpadQuery).then(r => r.ok ? r.json() : [])");
  });

  it("does not imply a failed reload deleted the note", () => {
    expect(scratchpad).toContain("Could not reload scratch pad (${res.status})");
    expect(scratchpad).toContain("Scratch Pad draft remains saved on this device");
  });

  it("reports the actual review API status and message", () => {
    expect(review).toContain("Scratch Pad notes could not be loaded (${status})");
    expect(review).toContain("readErrorMessage(notesResult.value)");
  });
});
