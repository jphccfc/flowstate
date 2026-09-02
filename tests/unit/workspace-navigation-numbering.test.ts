import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const nav = readFileSync(resolve(process.cwd(), "components/layout/WorkspaceNav.tsx"), "utf8");

describe("workspace navigation numbering", () => {
  it("derives navigation numbers from item order", () => {
    expect(nav).toContain("items.map((item, index)");
    expect(nav).toContain("String(index + 1).padStart");
    expect(nav).not.toMatch(/short:\\s*"02"/);
    expect(nav).not.toMatch(/short:\\s*"03"/);
  });
});
