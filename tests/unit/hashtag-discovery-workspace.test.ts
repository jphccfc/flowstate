import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("hashtag discovery workspace", () => {
  it("provides a discoverable cross-source hashtag search journey", () => {
    const page = readFileSync(resolve(root, "app/clients/[id]/discover/page.tsx"), "utf8");
    const overview = readFileSync(resolve(root, "app/clients/[id]/page.tsx"), "utf8");
    const navigation = readFileSync(resolve(root, "components/layout/WorkspaceNav.tsx"), "utf8");

    expect(page).toContain("Hashtag discovery");
    expect(page).toContain("/hashtags/discovery");
    expect(page).toContain("View source");
    expect(page).toContain("Source type");
    expect(overview).toContain('href: `/clients/${id}/discover`');
    expect(navigation).toContain('href: `/clients/${clientId}/discover`');
  });
});
