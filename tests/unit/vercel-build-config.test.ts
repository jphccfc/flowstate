import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const vercelConfig = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");

describe("production database deployment contract", () => {
  it("uses reviewed Prisma migrations instead of db push", () => {
    expect(vercelConfig).toContain('if [ \\"$VERCEL_ENV\\" = \\"production\\" ]; then npx prisma migrate deploy; fi && npm run build');
    expect(vercelConfig).not.toContain("prisma db push");
  });
});
