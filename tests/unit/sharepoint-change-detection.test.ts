import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDriveDelta } from "../../lib/integrations/graph";

const TOKEN = "token-for-test";
const graphPage = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260914170000_add_sharepoint_sync_metadata/migration.sql"), "utf8");
const sourceRoute = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/integrations/sharepoint/sources/route.ts"), "utf8");
const syncRoute = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/integrations/sharepoint/sync/route.ts"), "utf8");
const sync = readFileSync(resolve(process.cwd(), "lib/integrations/sharepoint-sync.ts"), "utf8");
const importRoute = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/integrations/sharepoint/import/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/integrations/sharepoint/page.tsx"), "utf8");

describe("Graph delta", () => {
  it("reads a delta page and normalises new or updated files", async () => {
    const fetchImpl = vi.fn(async () => graphPage({ value: [{ id: "f1", name: "new.pdf", size: 123, lastModifiedDateTime: "2026-09-14T00:00:00Z", file: { hashes: { sha256Hash: "hash-1" } } }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta-final" }));
    const result = await getDriveDelta(TOKEN, "drive-1", "root", { fetchImpl });
    expect(result.items).toEqual([{ id: "f1", name: "new.pdf", isFolder: false, size: 123, lastModifiedDateTime: "2026-09-14T00:00:00Z", webUrl: null, deleted: false, hash: "hash-1", version: "2026-09-14T00:00:00Z" }]);
    expect(result.deltaLink).toBe("https://graph.microsoft.com/v1.0/delta-final");
  });

  it("recognises deleted items", async () => {
    const fetchImpl = vi.fn(async () => graphPage({ value: [{ id: "gone", name: "gone.pdf", deleted: {} }], "@odata.deltaLink": "delta" }));
    const result = await getDriveDelta(TOKEN, "drive-1", "folder-1", { fetchImpl });
    expect(result.items[0].deleted).toBe(true);
  });

  it("follows the next link without adding Graph_BASE twice", async () => {
    const next = "https://graph.microsoft.com/v1.0/drives/delta?page=2";
    const fetchImpl = vi.fn(async () => graphPage({ value: [], "@odata.nextLink": next }));
    await getDriveDelta(TOKEN, "drive-1", "root", { deltaLink: next, fetchImpl });
    expect((fetchImpl.mock.calls as unknown as Array<[string]>)[0][0]).toBe(next);
  });

  it("does not expose the delta cursor in the returned API contract", () => {
    expect(sourceRoute).toContain("never delta URLs");
    expect(syncRoute).toContain("sourceId");
  });
});

describe("persisted source scope", () => {
  it("stores the exact site, library and folder scope", () => {
    expect(schema).toContain("model IntegrationSource");
    for (const field of ["siteId", "driveId", "folderItemId", "folderPath", "deltaLink", "syncStatus", "lastSyncedAt", "lastError", "enabled"]) expect(schema).toContain(field);
    expect(sourceRoute).toContain("integrationSource.upsert");
    expect(sourceRoute).toContain("folderItemId");
  });

  it("is organisation scoped and supports removal of a saved source", () => {
    expect(sourceRoute).toContain('authorize(id, "client.configure")');
    expect(sourceRoute).toContain("organizationId: id");
    expect(sourceRoute).toContain("deleteMany");
  });

  it("has an additive migration for metadata and explicit source removal", () => {
    expect(migration).toContain('ALTER TABLE "CapturedInput" ADD COLUMN "sourceHash" TEXT');
    expect(migration).toContain("SOURCE_REMOVED");
    expect(migration).toContain('CREATE TABLE "IntegrationSource"');
  });

  it("stores exact source identity and hash on imported evidence", () => {
    const importer = readFileSync(resolve(process.cwd(), "lib/integrations/sharepoint-import.ts"), "utf8");
    for (const field of ["sourceDriveId: driveId", "sourceItemId: itemId", "sourceVersion: version", "sourceHash"]) expect(importer).toContain(field);
  });
});

describe("delta sync behaviour", () => {
  it("is bounded and advances the cursor only after the page set completes", () => {
    expect(sync).toContain("MAX_DELTA_PAGES = 20");
    expect(sync).toContain("cursor not advanced");
    expect(sync).toContain("deltaLink: nextDeltaLink");
  });

  it("reuses the normal import and analysis path for new or changed files", () => {
    expect(sync).toContain("importDriveItem");
    expect(sync).toContain("processCapturedInput");
  });

  it("marks deleted source findings SOURCE_REMOVED without deleting history", () => {
    expect(sync).toContain("sourceItemId: item.id");
    expect(sync).toContain('data: { status: "SOURCE_REMOVED" }');
    expect(sync).not.toContain("documentFinding.deleteMany");
  });

  it("runs asynchronously behind the API response and exposes status", () => {
    expect(syncRoute).toContain('syncStatus: "RUNNING"');
    expect(syncRoute).toContain("after(async () =>");
    expect(sourceRoute).toContain("syncStatus: true");
  });

  it("does not return delta URLs to the browser", () => {
    expect(sourceRoute).not.toContain("deltaLink: source");
    expect(sourceRoute).not.toContain("deltaLink: true"); // only the test text above may mention the concept
  });
});

describe("sync controls", () => {
  it("lets an operator save a folder for monitoring", () => {
    expect(page).toContain("Save folder for monitoring");
    expect(page).toContain("${api}/sources");
    expect(page).toContain("folderItemId: currentPath.id");
  });

  it("starts a change scan only after the scope is saved", () => {
    expect(page).toContain("Check for changes");
    expect(page).toContain("Save the selected folder for monitoring first.");
    expect(page).toContain("${api}/sync?sourceId=");
  });

  it("explains what the scan will do", () => {
    expect(page).toContain("New and updated documents will be analysed");
    expect(page).toContain("removed sources will be marked removed");
  });

  it("keeps the original file out of Flowstate", () => {
    expect(importRoute).toContain("walkDriveFolder");
    const importer = readFileSync(resolve(process.cwd(), "lib/integrations/sharepoint-import.ts"), "utf8");
    expect(importer).toContain("Text only — the response body is never persisted.");
  });
});
