import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public privilege migration portability", () => {
  it("does not abort deployments when Supabase roles are absent", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260908140000_contain_public_rls_privileges/migration.sql"), "utf8");
    expect(sql).toContain("FROM pg_roles");
    expect(sql).toContain("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC");
    expect(sql).not.toContain("FROM PUBLIC, anon, authenticated");
  });
});
