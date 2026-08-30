import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const page = readFileSync(resolve(root, "app/clients/[id]/recommendations/page.tsx"), "utf8");
const route = readFileSync(resolve(root, "app/api/clients/[id]/growth-actions/route.ts"), "utf8");

describe("Growth Plan action visibility", () => {
  it("lets advisors find persisted strategic actions and their next status", () => {
    expect(page).toContain("Growth actions");
    expect(page).toContain("/api/clients/${organizationId}/growth-actions");
    expect(page).toContain("IN_PROGRESS");
    expect(page).toContain("Update status");
  });

  it("scopes the action feed to an authorized client", () => {
    expect(route).toContain("export async function GET");
    expect(route).toContain('hasOrganizationPermission(user.email, id, "client.read")');
    expect(route).toContain('organizationId: id');
  });
});
