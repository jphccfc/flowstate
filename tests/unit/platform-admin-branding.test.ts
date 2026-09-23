import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../../app/admin/page.tsx", import.meta.url), "utf8");
const agents = readFileSync(new URL("../../app/admin/agents/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

describe("Platform Admin branding", () => {
  it("renders the Flowstate brand in the main and catalogue admin headers", () => {
    expect(admin).toContain('className="admin-top-brand"');
    expect(agents).toContain('className="admin-top-brand"');
    expect(admin).toContain('aria-label="Flowstate home"');
    expect(agents).toContain('aria-label="Flowstate home"');
  });

  it("gives the top-right FS mark an explicit visible treatment", () => {
    const mark = css.match(/\.admin-top-brand-mark\s*\{[^}]+\}/)?.[0] ?? "";
    expect(mark).toContain("background:");
    expect(mark).toContain("color:");
    expect(mark).toContain("display: inline-flex");
    expect(css).toContain(".admin-top-brand-name");
  });
});
