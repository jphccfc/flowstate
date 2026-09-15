import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260915090000_add_document_families/migration.sql"), "utf8");

describe("document family migration", () => {
  it("adds the superseded finding state before using it", () => {
    expect(migration).toContain('ALTER TYPE "FindingStatus" ADD VALUE \'SUPERSEDED\';');
    expect(migration.indexOf('ALTER TYPE "FindingStatus"')).toBeLessThan(migration.indexOf('CREATE TABLE "DocumentFamily"'));
  });

  it("creates only additive family/version structures", () => {
    expect(migration).toContain('CREATE TYPE "DocumentVersionStatus"');
    expect(migration).toContain('ADD COLUMN "documentFamilyId"');
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DROP COLUMN/i);
  });
});
