import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../../app/admin/page.tsx", import.meta.url), "utf8");
const agents = readFileSync(new URL("../../app/admin/agents/page.tsx", import.meta.url), "utf8");

describe("platform admin branding", () => {
  it("renders the Flowstate brand in the admin header and agent catalogue header", () => {
    expect(admin).toContain("admin-top-brand");
    expect(agents).toContain("admin-top-brand");
    expect(admin).toContain("Flowstate");
    expect(agents).toContain("Flowstate");
  });
});
