import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(process.cwd(), "prisma/migrations/20260909150000_reconcile_scratchpad_columns/migration.sql");

describe("scratchpad schema reconciliation migration", () => {
  it("is forward-only and repairs columns used by the live scratchpad routes", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS");
    expect(sql).toContain('"meetingContextId"');
    expect(sql).toContain('"revision"');
    expect(sql).toContain('"senderEmail"');
    expect(sql).toContain('"reviewStatus"');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
    expect(sql).not.toContain("db push");
  });
});
