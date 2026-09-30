import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const page = readFileSync(resolve(root, "app/portal/page.tsx"), "utf8");
const organizations = readFileSync(resolve(root, "app/api/external/organizations/route.ts"), "utf8");

describe("FS-22 external portal shell", () => {
  it("loads only portal-linked organisations and calls the external-safe routes", () => {
    expect(organizations).toContain("stakeholderPortalMembership.findMany");
    expect(organizations).toContain("organization");
    expect(page).toContain("/api/external/organizations");
    expect(page).toContain("/api/external/tasks");
    expect(page).toContain("/api/external/meetings");
    expect(page).toContain("complete: true");
    expect(page).toContain("Add comment");
  });

  it("does not render assessment or internal-workspace links", () => {
    expect(page).not.toContain("FlowScore");
    expect(page).not.toContain("/assess");
    expect(page).not.toContain("/review");
  });
});
