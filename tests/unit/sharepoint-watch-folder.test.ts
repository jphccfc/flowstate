import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const cron = readFileSync(new URL("../../app/api/cron/sharepoint-sync/route.ts", import.meta.url), "utf8");
const config = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/clients/[id]/integrations/sharepoint/page.tsx", import.meta.url), "utf8");

describe("SharePoint watch-folder workflow", () => {
  it("schedules authenticated delta scans for enabled sources", () => {
    expect(config).toContain("/api/cron/sharepoint-sync");
    expect(config).toContain("0 2 * * *");
    expect(cron).toContain("CRON_SECRET");
    expect(cron).toContain('enabled: true');
    expect(cron).toContain("syncIntegrationSource");
  });

  it("keeps the on-demand scan and exposes imported documents", () => {
    expect(page).toContain("Check for changes");
    expect(page).toContain("View imported documents");
    expect(page).toContain("/sync?sourceId=");
  });
});
