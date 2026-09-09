import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Scratch Pad schema reconciliation migration", () => {
  it("adds missing Scratch Pad columns without destructive operations", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260909150000_reconcile_scratchpad_columns/migration.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "sessionId"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "reviewStatus"');
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS");
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i);
  });
});
