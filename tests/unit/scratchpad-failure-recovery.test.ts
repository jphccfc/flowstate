import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const scratchpad = readFileSync(resolve(root, "app/clients/[id]/scratchpad/page.tsx"), "utf8");
const review = readFileSync(resolve(root, "app/clients/[id]/review/page.tsx"), "utf8");

describe("Scratch Pad failure recovery contract", () => {
  it("supports an independent collection of notes instead of one reusable note", () => {
    const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/scratchpad/page.tsx"), "utf8");
    expect(page).toContain("const [notes, setNotes] = useState<Note[]>([])");
    expect(page).toContain("New note");
    expect(page).toContain("setNoteCollection(rows)");
    expect(page).not.toContain("if (rows[0]) {");
  });

  it("supports deleting an individual note through the API", () => {
    const route = readFileSync(resolve(process.cwd(), "app/api/scratchpad/route.ts"), "utf8");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("prisma.capturedInput.delete");
    expect(route).toContain("if (!(await access(user.email, existing.organizationId)))");
  });

  it("clears the shared new-note draft instead of restoring prior text", () => {
    const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/scratchpad/page.tsx"), "utf8");
    expect(page).toContain("localStorage.removeItem(cacheKeyFor(null))");
    expect(page).toContain("setContextId(\"\")");
  });

  it("surfaces the API error while retaining the local draft", () => {
    expect(scratchpad).toContain("localStorage.setItem(cacheKeyFor(noteRef.current?.id ?? null), safe)");
    expect(scratchpad).toContain("Save failed: ${typeof result.error === \"string\" ? result.error : res.status}");
    expect(scratchpad).toContain("role=\"alert\"");
    expect(scratchpad).toContain("fetch(scratchpadQuery).then(async response =>");
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
