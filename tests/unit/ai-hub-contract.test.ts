import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/ai/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/ai/page.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "components/layout/WorkspaceNav.tsx"), "utf8");

describe("client AI Hub contract", () => {
  it("exposes a client-facing question flow with citations and no-results state", () => {
    expect(nav).toContain('label: "AI Hub"');
    expect(page).toContain("Ask AI Hub");
    expect(page).toContain("Sources");
    expect(page).toContain("No matching authorized workspace sources");
  });

  it("authenticates and scopes every workspace query to the route organization", () => {
    expect(route).toContain("canAccessClient(user.email, organizationId)");
    expect(route).toContain("where: { organizationId");
    expect(route).toContain("publishedPromptVersion");
    expect(route).not.toMatch(/\$queryRaw|SELECT\s+\*|tableName|sql/i);
  });
});
