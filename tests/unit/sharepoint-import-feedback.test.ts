import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const integrationRoute = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/integrations/sharepoint/route.ts"), "utf8");
const integrationPage = readFileSync(resolve(process.cwd(), "app/clients/[id]/integrations/sharepoint/page.tsx"), "utf8");
const importRoute = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/integrations/sharepoint/import/route.ts"), "utf8");

describe("SharePoint saved-scope and import-feedback regression", () => {
  it("hydrates the latest saved source into the integration status contract", () => {
    expect(integrationRoute).toContain("integrationSource.findFirst");
    expect(integrationRoute).toContain("sourceSelection");
    expect(integrationRoute).not.toContain('sourceSelection: { site: "", library: "", folder: "" }');
  });

  it("renders named per-item outcomes instead of only aggregate import counts", () => {
    expect(integrationPage).toContain("Import details");
    expect(integrationPage).toContain("itemName");
    expect(integrationPage).toContain("outcome.error");
    expect(importRoute).toContain("unsupportedItems");
    expect(importRoute).toContain("unsupported_type:");
  });
});
