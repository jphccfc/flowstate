import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../../prisma/migrations/20260908140000_contain_public_rls_privileges/migration.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("public RLS and privilege containment migration", () => {
  it("contains the forward-only Supabase containment contract", () => {
    expect(migrationSql).toContain("c.relkind IN ('r', 'p')");
    expect(migrationSql).toContain("c.relname <> '_prisma_migrations'");
    expect(migrationSql).toContain("ALTER TABLE %s.%s ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain(
      "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;",
    );
    expect(migrationSql).toContain(
      "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;",
    );
    expect(migrationSql).toContain(
      "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public",
    );
    expect(migrationSql).toContain(
      "REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;",
    );
    expect(migrationSql).toContain(
      "REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;",
    );
    expect(migrationSql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i);
    expect(migrationSql).not.toMatch(/FROM\s+service_role/i);
  });
});
