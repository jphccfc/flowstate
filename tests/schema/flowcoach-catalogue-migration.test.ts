import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260915150000_name_client_ai_hub_flowcoach/migration.sql"), "utf8");

describe("FlowCoach catalogue identity migration", () => {
  it("renames only the canonical client_ai_hub display record", () => {
    expect(migration).toContain('WHERE "key" = \'client_ai_hub\'');
    expect(migration).toContain('SET "name" = \'FlowCoach\'');
    expect(migration).not.toContain("DELETE");
  });
});
