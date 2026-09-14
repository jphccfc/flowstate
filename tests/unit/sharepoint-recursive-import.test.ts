import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { walkDriveFolder } from "../../lib/integrations/graph";
import { isSupportedDocument } from "../../lib/integrations/sharepoint-import";

const TOKEN = "test-token";
const DRIVE = "drive-1";

const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/integrations/sharepoint/page.tsx"), "utf8");
const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/integrations/sharepoint/import/route.ts"), "utf8");

type Node = { id: string; name: string; folder?: Record<string, never>; file?: Record<string, never>; size?: number };

const TREE: Record<string, Node[]> = {
  root: [
    { id: "folderA", name: "Board Pack", folder: {} },
    { id: "top", name: "Overview.pdf", file: {}, size: 1_000 },
    { id: "forms", name: "Forms", folder: {} },
  ],
  folderA: [
    { id: "nested", name: "Strategy.docx", file: {}, size: 2_000 },
    { id: "folderB", name: "Appendix", folder: {} },
    { id: "sheet", name: "Model.xlsx", file: {}, size: 4_000 },
  ],
  folderB: [{ id: "deep", name: "Detail.pdf", file: {}, size: 8_000 }],
};

function fakeGraph(tree: Record<string, Node[]>): typeof fetch {
  const impl = vi.fn(async (url: string) => {
    const match = url.match(/\/items\/([^/]+)\/children/);
    const itemId = match ? decodeURIComponent(match[1]) : "";
    return { ok: true, status: 200, json: async () => ({ value: tree[itemId] ?? [] }) } as unknown as Response;
  });
  return impl as unknown as typeof fetch;
}

describe("recursive folder walk", () => {
  it("collects files from the folder and everything beneath it", async () => {
    const walk = await walkDriveFolder(TOKEN, DRIVE, "root", { fetchImpl: fakeGraph(TREE) });
    const names = walk.files.map((f) => f.name).sort();
    expect(names).toEqual(["Detail.pdf", "Model.xlsx", "Overview.pdf", "Strategy.docx"]);
  });

  it("records where each file came from, so a finding can be traced to a path", async () => {
    const walk = await walkDriveFolder(TOKEN, DRIVE, "root", { fetchImpl: fakeGraph(TREE) });
    const detail = walk.files.find((f) => f.name === "Detail.pdf");
    expect(detail?.path).toBe("Board Pack/Appendix/Detail.pdf");
  });

  it("skips SharePoint system folders and says why", async () => {
    const walk = await walkDriveFolder(TOKEN, DRIVE, "root", { fetchImpl: fakeGraph(TREE) });
    expect(walk.files.some((f) => f.name === "Forms")).toBe(false);
    expect(walk.skipped).toEqual([{ name: "Forms", reason: "SharePoint system folder" }]);
  });

  it("totals the bytes it would read", async () => {
    const walk = await walkDriveFolder(TOKEN, DRIVE, "root", { fetchImpl: fakeGraph(TREE) });
    expect(walk.totalBytes).toBe(15_000);
  });

  it("stops at the item limit and reports that it truncated", async () => {
    const walk = await walkDriveFolder(TOKEN, DRIVE, "root", { fetchImpl: fakeGraph(TREE), maxItems: 2 });
    expect(walk.files).toHaveLength(2);
    expect(walk.truncated).toBe(true);
  });

  it("stops at the depth limit rather than descending forever", async () => {
    const walk = await walkDriveFolder(TOKEN, DRIVE, "root", { fetchImpl: fakeGraph(TREE), maxDepth: 1 });
    expect(walk.files.some((f) => f.name === "Detail.pdf")).toBe(false);
    expect(walk.skipped.some((s) => s.reason === "depth limit reached")).toBe(true);
  });

  it("never issues an unbounded number of Graph calls", async () => {
    // foldersScanned is incremented once per children listing, so it is the
    // direct measure of Graph calls the walk made.
    const walk = await walkDriveFolder(TOKEN, DRIVE, "root", { fetchImpl: fakeGraph(TREE), maxItems: 1 });
    expect(walk.files).toHaveLength(1);
    expect(walk.truncated).toBe(true);
    expect(walk.foldersScanned).toBeLessThanOrEqual(2);
  });

  it("requires a drive id", async () => {
    await expect(walkDriveFolder(TOKEN, "", "root")).rejects.toThrow(/library id is required/);
  });

  it("tolerates a folder that cannot be read as a whole", async () => {
    const errored = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { code: "Forbidden" } }) }) as unknown as Response);
    await expect(walkDriveFolder(TOKEN, DRIVE, "root", { fetchImpl: errored })).rejects.toThrow(/Forbidden/);
  });
});

describe("which files can actually be read", () => {
  it("accepts the supported document types", () => {
    for (const name of ["brief.pdf", "Plan.DOCX", "report.docx"]) expect(isSupportedDocument(name)).toBe(true);
  });

  it("rejects types the extractor cannot read", () => {
    for (const name of ["model.xlsx", "deck.pptx", "notes.txt", "archive.zip", "no-extension"]) {
      expect(isSupportedDocument(name)).toBe(false);
    }
  });
});

describe("import route", () => {
  it("previews without importing anything", () => {
    const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    expect(get).toContain("walkDriveFolder");
    expect(get).not.toContain("importDriveItem(");
  });

  it("reports supported and unsupported counts honestly in the preview", () => {
    expect(route).toContain("const supported = walk.files.filter((file) => isSupportedDocument(file.name))");
    expect(route).toContain("unsupported: walk.files.length - supported.length");
  });

  it("pages a large folder by offset so the loop always makes progress", () => {
    expect(route).toContain("supported.slice(offset, offset + MAX_IMPORT_PER_REQUEST)");
    expect(route).toContain("nextOffset");
    expect(route).toContain("remaining: Math.max(0, supported.length - nextOffset)");
  });

  it("requires a folder id for a recursive import", () => {
    expect(route).toContain("itemId is required for a recursive import");
  });

  it("keeps the explicit itemIds path and its bound", () => {
    expect(route).toContain("MAX_ITEMS_PER_REQUEST = 50");
    expect(route).toContain("At most ${MAX_ITEMS_PER_REQUEST} items per request");
    expect(route).toContain("{ summary, results, walk: walkSummary, queuedForAnalysis: analysisTargets.length }");
  });
});

describe("import UI", () => {
  it("asks the real import endpoint for a preview instead of the foundation stub", () => {
    expect(page).toContain("/import?driveId=");
    expect(page).not.toContain("Items available:");
  });

  it("imports the selected folder recursively", () => {
    expect(page).toContain("recursive: true");
    expect(page).toContain("offset");
  });

  it("keeps importing until nothing remains", () => {
    expect(page).toContain("const remaining = data.walk?.remaining ?? 0");
    expect(page).toContain("if (remaining <= 0 || next <= offset) break;");
  });

  it("states the document count and size before committing", () => {
    // The label is composed in JSX, so assert the composition rather than a
    // flat string that would never appear in the source.
    expect(page).toContain('document{preview.supported === 1 ? "" : "s"} to import');
    expect(page).toContain("formatBytes(preview.totalBytes)");
  });

  it("warns when the scan limit makes the count a minimum", () => {
    expect(page).toContain("so the count above is a minimum");
  });

  it("points the reviewer at the queue the evidence lands in", () => {
    expect(page).toContain("Review queue");
  });
});

describe("imported documents are analysed, not just stored", () => {
  it("runs the tagging pipeline on what it imported", () => {
    expect(route).toContain("processCapturedInput(capturedInputId)");
    expect(route).toContain('import { processCapturedInput } from "@/lib/ingestion/pipeline"');
  });

  it("analyses only newly imported documents", () => {
    expect(route).toContain('r.outcome.status === "imported" ? r.outcome.capturedInputId : null');
  });

  it("reports how many documents were queued for analysis", () => {
    expect(route).toContain("queuedForAnalysis: analysisTargets.length");
    expect(page).toContain("queued for analysis");
  });

  it("isolates analysis failures so one document cannot stop the batch", () => {
    const block = route.slice(route.indexOf("after(async () =>"));
    expect(block).toContain("try {");
    expect(block).toContain("} catch {");
  });

  it("does not hold the response open while analysing", () => {
    // after() defers past the response, matching scratchpad and captured-inputs.
    expect(route).toContain("after(async () => {");
  });
});
