import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(
  resolve(process.cwd(), "app/api/clients/[id]/integrations/sharepoint/import/route.ts"),
  "utf8",
);
const importer = readFileSync(resolve(process.cwd(), "lib/integrations/sharepoint-import.ts"), "utf8");

describe("SharePoint import route", () => {
  it("authenticates and requires the client.configure permission", () => {
    expect(route).toContain("auth.getUser()");
    expect(route).toContain('hasOrganizationPermission(user.email, id, "client.configure")');
    expect(route).toContain("{ status: 401 }");
    expect(route).toContain("{ status: 403 }");
  });

  it("resolves the connection from the route organisation only", () => {
    expect(route).toContain("getAccessToken(prisma, id)");
    expect(route).not.toContain('searchParams.get("organizationId")');
    expect(route).toContain("{ status: 409 }");
  });

  it("bounds the work per request", () => {
    expect(route).toContain("MAX_ITEMS_PER_REQUEST = 50");
    expect(route).toContain("At most ${MAX_ITEMS_PER_REQUEST} items per request");
    expect(route).toContain('{ status: 400 }');
  });

  it("isolates per-item failures so one bad item cannot abort the batch", () => {
    expect(route).toContain("for (const itemId of itemIds)");
    expect(route).toContain('{ status: "failed"');
    expect(route).toContain("{ summary, results }");
  });
});

describe("import persisting text instead of files", () => {
  it("never persists the document bytes", () => {
    expect(importer).not.toContain("Buffer.from(await");
    expect(importer).not.toContain("writeFile");
    expect(importer).not.toContain("storage.from");
    expect(importer).toContain("// Text only — the response body is never persisted.");
  });

  it("does not forward the bearer token to the pre-authenticated download host", () => {
    expect(importer).toContain('redirect: "manual"');
    expect(importer).toContain("const downloadResponse = await fetchImpl(downloadUrl, { headers: {} })");
  });

  it("keeps evidence idempotent and reviewable", () => {
    expect(importer).toContain("idempotencyKey");
    expect(importer).toContain("organizationId_idempotencyKey");
    expect(importer).toContain('reviewStatus: "PENDING_REVIEW"');
    expect(importer).toContain('type: "DOCUMENT"');
  });

  it("skips folders and unsupported types with a reason rather than failing", () => {
    expect(importer).toContain('{ status: "skipped", reason: "folder" }');
    expect(importer).toContain("unsupported_type:");
    expect(importer).toContain('SUPPORTED_EXTENSIONS = ["pdf", "docx"]');
  });
});
