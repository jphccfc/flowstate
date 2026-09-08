import { describe, expect, it, vi } from "vitest";
import { sanitizeRichText } from "../../lib/scratchpad/rich-text";
import { createScratchpadSaveQueue } from "../../lib/scratchpad/save-queue";

describe("scratchpad rich text", () => {
  it("keeps plain text and only allows safe formatting elements", () => {
    expect(sanitizeRichText("A plain note")).toBe("A plain note");
    expect(sanitizeRichText('<p><strong>Bold</strong> <u>underlined</u></p><script>alert(1)</script><img src=x>'))
      .toBe("<p><strong>Bold</strong> <u>underlined</u></p>");
  });
});

describe("scratchpad save queue", () => {
  it("serializes rapid edits and retries a revision conflict against the latest revision", async () => {
    const calls: Array<{ text: string; revision: number }> = [];
    let first = true;
    const reload = vi.fn(async () => ({ revision: 4 }));
    const save = vi.fn(async (payload: { text: string; revision: number }) => {
      calls.push(payload);
      if (first) { first = false; return { kind: "conflict" as const }; }
      return { kind: "saved" as const, revision: payload.revision + 1 };
    });
    const states: string[] = [];
    const queue = createScratchpadSaveQueue(save, reload, state => states.push(state));

    queue.enqueue({ text: "first", revision: 3 });
    queue.enqueue({ text: "latest", revision: 3 });
    await queue.flush();

    expect(calls).toEqual([{ text: "latest", revision: 3 }, { text: "latest", revision: 4 }]);
    expect(states).toContain("Saving");
    expect(states.at(-1)).toBe("Saved");
  });
});
