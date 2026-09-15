import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "components/layout/WorkspaceNav.tsx"), "utf8");

describe("workspace navigation fixed actions", () => {
  it("keeps the rail within the viewport and navigation independently scrollable", () => {
    expect(css).toContain("position: sticky");
    expect(css).toContain("height: 100vh");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("min-height: 0");
  });

  it("keeps profile, theme and sign-out controls in the action region", () => {
    expect(nav).toContain('className="workspace-actions"');
    expect(nav).toContain('href="/profile"');
    expect(nav).toContain("<ThemeToggle />");
    expect(nav).toContain("onClick={signOut}");
  });

  it("resets sticky desktop behavior for the mobile navigation layout", () => {
    expect(css).toContain(".workspace-rail { position: static; height: auto;");
  });
});
