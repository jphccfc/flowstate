import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const overview = readFileSync(resolve(process.cwd(), "app/clients/[id]/page.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "components/layout/WorkspaceNav.tsx"), "utf8");
const themeToggle = readFileSync(resolve(process.cwd(), "components/layout/ThemeToggle.tsx"), "utf8");
const configure = readFileSync(resolve(process.cwd(), "app/clients/[id]/configure/page.tsx"), "utf8");
const dialog = readFileSync(resolve(process.cwd(), "components/ui/FlowstateDialog.tsx"), "utf8");

describe("workspace responsive and theme contracts", () => {
  it("uses theme tokens rather than a light-only overview card background", () => {
    expect(css).toContain(".workspace-card");
    expect(css).toContain("linear-gradient(145deg, var(--card), var(--muted-bg))");
    expect(css).not.toContain("linear-gradient(145deg, #ffffff, #f8fbff)");
  });

  it("stacks overview action cards on narrow screens", () => {
    expect(overview).toContain('className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8"');
  });

  it("avoids a persisted-theme hydration mismatch", () => {
    expect(themeToggle).toContain("useSyncExternalStore");
    expect(themeToggle).toContain("function getServerSnapshot(): Theme");
    expect(themeToggle).toContain('return "light";');
  });

  it("uses an explicitly controlled mobile navigation panel", () => {
    expect(nav).toContain('aria-controls="workspace-navigation-panel"');
    expect(nav).toContain('id="workspace-navigation-panel"');
    expect(css).toContain(".workspace-rail.is-open .workspace-navigation-panel");
    expect(css.indexOf(".workspace-navigation-panel { display: flex")).toBeLessThan(css.indexOf("@media (max-width: 800px)"));
    expect(css).toContain(".workspace-menu-button { display: inline-flex !important;");
  });

  it("uses Flowstate dialogs instead of native browser prompts", () => {
    expect(configure).not.toMatch(/\b(prompt|confirm)\s*\(/);
    expect(configure).toContain("FlowstateDialog");
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain("aria-modal=\"true\"");
  });
});
