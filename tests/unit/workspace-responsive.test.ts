import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const overview = readFileSync(resolve(process.cwd(), "app/clients/[id]/page.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "components/layout/WorkspaceNav.tsx"), "utf8");
const themeToggle = readFileSync(resolve(process.cwd(), "components/layout/ThemeToggle.tsx"), "utf8");
const configure = readFileSync(resolve(process.cwd(), "app/clients/[id]/configure/page.tsx"), "utf8");
const dialog = readFileSync(resolve(process.cwd(), "components/ui/FlowstateDialog.tsx"), "utf8");
const assess = readFileSync(resolve(process.cwd(), "app/clients/[id]/assess/page.tsx"), "utf8");
const report = readFileSync(resolve(process.cwd(), "app/clients/[id]/report/page.tsx"), "utf8");

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

  it("keeps assessment content inside the shared workspace shell", () => {
    expect(assess).not.toContain('className="assessment-workspace flex overflow-hidden"');
    expect(assess).toContain('className="assessment-selector workspace-card"');
    expect(css).toContain(".assessment-selector");
    expect(css).toContain(".assessment-content");
  });

  it("uses a compact assessment selector instead of a permanent third column", () => {
    expect(assess).toContain('className="assessment-selector workspace-card"');
    expect(assess).not.toContain('className="assessment-layout"');
    expect(css).toContain(".assessment-selector");
    expect(css).not.toContain("grid-template-columns: minmax(15rem, 18rem) minmax(0, 1fr)");
  });

  it("shows multi-perspective assessment balance and rubric context", () => {
    expect(assess).toContain("Perspective balance");
    expect(assess).toContain("Employee perspectives");
    expect(assess).toContain("Expert perspectives");
    expect(assess).toContain("Current maturity rubric");
    expect(assess).toContain("Add perspective");
    expect(assess).toContain("Evidence coverage");
    expect(assess).toContain("Pending review");
    expect(assess).toContain("Generate proposal");
    expect(assess).toContain("Approve proposal");
    expect(assess).toContain("Original statement");
    expect(assess).toContain("stakeholderType");
    expect(assess).toContain("/perspectives");
    expect(assess).toContain("Perspective data could not load");
    expect(assess).toContain("Set both current and target scores to calculate the gap");
    expect(assess).toContain("Overall capability gap");
    expect(assess).toContain("history.gap ?? calculateGap");
    expect(assess).toContain("Assessment saved");
    expect(assess).toContain("setScore(0)");
  });

  it("shows clearly labelled report examples", () => {
    expect(report).toContain("Report examples");
    expect(report).toContain("Example: Executive snapshot");
    expect(report).toContain("Example output");
  });

  it("uses Flowstate dialogs instead of native browser prompts", () => {
    expect(configure).not.toMatch(/\b(prompt|confirm)\s*\(/);
    expect(configure).toContain("FlowstateDialog");
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain("aria-modal=\"true\"");
  });
});
