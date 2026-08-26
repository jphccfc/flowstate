import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = readFileSync(resolve(root, "app/api/capabilities/[id]/decisions/route.ts"), "utf8");
const page = readFileSync(resolve(root, "app/clients/[id]/assess/page.tsx"), "utf8");

describe("assessment approval governance", () => {
  it("prevents repeat approval and directs reviewers to reopen", () => {
    expect(route).toContain("assessment already has an approved decision; reopen it before approving again");
    expect(page).toContain("Assessment already approved");
    expect(page).toContain("Reopen");
  });
});
