import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeRichText } from "../../lib/scratchpad/rich-text";
import { createScratchpadSaveQueue } from "../../lib/scratchpad/save-queue";

describe("scratchpad rich text", () => {
  it("keeps plain text and only allows safe formatting elements", () => {
    expect(sanitizeRichText("A plain note")).toBe("A plain note");
    expect(sanitizeRichText('<p><strong>Bold</strong> <u>underlined</u></p><script>alert(1)</script><img src=x>'))
      .toBe("<p><strong>Bold</strong> <u>underlined</u></p>");
  });

  it("is idempotent and decodes entities before escaping text", () => {
    const sanitized = sanitizeRichText("<p>P&amp;L: 10 &lt; 20</p>");
    expect(sanitized).toBe("<p>P&amp;L: 10 &lt; 20</p>");
    expect(sanitizeRichText(sanitized)).toBe(sanitized);
    expect(sanitizeRichText("P&amp;amp;L")).toBe("P&amp;L");
  });

  it("does not let encoded markup become executable markup", () => {
    expect(sanitizeRichText("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });
});

describe("scratchpad editor reconciliation", () => {
  it("only reconciles external HTML when the editor is idle and clean", async () => {
    const { canReconcileEditor } = await import("../../lib/scratchpad/editor-sync");
    expect(canReconcileEditor({ dirty: false, composing: false })).toBe(true);
    expect(canReconcileEditor({ dirty: true, composing: false })).toBe(false);
    expect(canReconcileEditor({ dirty: false, composing: true })).toBe(false);
  });
});

describe("scratchpad editor lifecycle", () => {
  it("waits for the initial note load and flushes the latest draft after it", () => {
    const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/scratchpad/page.tsx"), "utf8");
    expect(page).toContain("const loadedRef = useRef(false)");
    expect(page).toContain("if (!loadedRef.current) return");
    expect(page).toContain("draftRef.current");
  });

  it("enqueues the final composition snapshot", () => {
    const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/scratchpad/page.tsx"), "utf8");
    expect(page).toContain("onCompositionEnd={() => { composingRef.current = false; enqueue(editorRef.current?.innerHTML ?? \"\"); }}");
  });
});


describe("scratchpad save queue", () => {
  it("carries the saved revision into the coalesced next snapshot", async () => {
    const calls: Array<{ text: string; revision: number }> = [];
    let releaseFirst!: (result: { kind: "saved"; revision: number }) => void;
    const firstSave = new Promise<{ kind: "saved"; revision: number }>(resolve => { releaseFirst = resolve; });
    const save = vi.fn(async (payload: { text: string; revision: number }) => {
      calls.push(payload);
      if (calls.length === 1) return firstSave;
      return { kind: "saved" as const, revision: payload.revision + 1 };
    });
    const queue = createScratchpadSaveQueue(save, vi.fn(async () => ({ revision: 99 })), () => {});

    queue.enqueue({ text: "typed", revision: 0 });
    await Promise.resolve();
    queue.enqueue({ text: "typed more", revision: 0 });
    releaseFirst({ kind: "saved", revision: 1 });
    await queue.flush();

    expect(calls).toEqual([{ text: "typed", revision: 0 }, { text: "typed more", revision: 1 }]);
  });

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
