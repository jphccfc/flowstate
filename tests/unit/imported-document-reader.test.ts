import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/clients/[id]/documents/[documentId]/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/clients/[id]/documents/[documentId]/page.tsx", import.meta.url), "utf8");
const findingsPage = readFileSync(new URL("../../app/clients/[id]/findings/page.tsx", import.meta.url), "utf8");

describe("imported document reader", () => {
  it("scopes the full-text API to the client and document", () => {
    expect(route).toContain("capturedInput.findFirst");
    expect(route).toContain("organizationId: id");
    expect(route).toContain("rawText: true");
    expect(route).toContain("hasOrganizationPermission");
  });
  it("renders full text and source metadata", () => {
    expect(page).toContain("Full text");
    expect(findingsPage).toContain("Open full document");
    expect(page).toContain("document.rawText");
    expect(page).toContain("Open original SharePoint source");
  });
});
