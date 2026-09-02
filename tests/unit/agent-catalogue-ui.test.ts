import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const page = readFileSync(path.resolve(process.cwd(), "app/admin/agents/page.tsx"), "utf8");

describe("SYSTEM_ADMIN agent catalogue UI contract", () => {
  it("keeps catalogue actions and published-versus-draft boundaries visible", () => {
    expect(page).toContain("Agent catalogue");
    expect(page).toContain("Create agent");
    expect(page).toContain("Published prompt");
    expect(page).toContain("Draft prompt versions");
    expect(page).toContain("Version history");
    expect(page).toContain("Change reason");
    expect(page).toContain("Publish version");
    expect(page).toContain("window.confirm");
  });

  it("uses the protected agent APIs without model execution or secret fields", () => {
    expect(page).toContain("fetch(\"/api/admin/agents\")");
    expect(page).toContain("/versions");
    expect(page).toContain("/publish");
    expect(page).not.toMatch(/execute|model/i);
    expect(page).not.toMatch(/apiKey|secret|token/i);
  });
});
