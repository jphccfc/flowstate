import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const overview = readFileSync(resolve(process.cwd(), "app/clients/[id]/page.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "components/layout/WorkspaceNav.tsx"), "utf8");
const themeToggle = readFileSync(resolve(process.cwd(), "components/layout/ThemeToggle.tsx"), "utf8");
const configure = readFileSync(resolve(process.cwd(), "app/clients/[id]/configure/page.tsx"), "utf8");
const dialog = readFileSync(resolve(process.cwd(), "components/ui/FlowstateDialog.tsx"), "utf8");
const admin = readFileSync(resolve(process.cwd(), "app/admin/page.tsx"), "utf8");
const navbar = readFileSync(resolve(process.cwd(), "components/layout/Navbar.tsx"), "utf8");
const assess = readFileSync(resolve(process.cwd(), "app/clients/[id]/assess/page.tsx"), "utf8");
const report = readFileSync(resolve(process.cwd(), "app/clients/[id]/report/page.tsx"), "utf8");
const analysis = readFileSync(resolve(process.cwd(), "app/clients/[id]/analysis/page.tsx"), "utf8");

describe("workspace responsive and theme contracts", () => {
  it("uses theme tokens rather than a light-only overview card background", () => {
    expect(css).toContain(".workspace-card");
    expect(css).toContain("linear-gradient(145deg, var(--card), var(--muted-bg))");
    expect(css).not.toContain("linear-gradient(145deg, #ffffff, #f8fbff)");
  });

  it("stacks overview action cards on narrow screens", () => {
    expect(overview).toContain('className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8"');
  });

  it("separates assessment tasks from the strategic growth plan", () => {
    expect(overview).toContain('>Assessment tasks</h2>');
    expect(overview).toContain('>Growth plan</h2>');
    expect(overview).toContain("Operational work required to complete the assessment");
    expect(overview).toContain("Strategic initiatives to improve the business outcome");
  });

  it("shows planning items in the Flowstate process on the workspace overview", () => {
    expect(overview).toContain("Evidence → Assessment → Decision → Planning Items → Growth Plan → Outcome");
    expect(overview).toContain("Planning items");
    expect(overview).toContain("Profit / sale / liquidation");
  });

  it("keeps planning controls aligned with assessment task controls and uses proper-case types", () => {
    const planning = readFileSync(resolve(process.cwd(), "app/clients/[id]/planning/page.tsx"), "utf8");
    expect(planning).toContain('className="dashboard-primary-button px-4 py-2 rounded-lg text-sm font-medium"');
    expect(planning).toContain('className="flex flex-wrap items-start justify-between gap-4 mb-8"');
    expect(planning).toContain("Requirement");
    expect(planning).toContain("Specification");
    expect(planning).toContain("Goal");
    expect(planning).toContain("Objective");
    expect(planning).not.toContain('<option key={type}>{type}</option>');
  });

  it("avoids a persisted-theme hydration mismatch", () => {
    expect(themeToggle).toContain("useSyncExternalStore");
    expect(themeToggle).toContain("function getServerSnapshot(): Theme");
    expect(themeToggle).toContain('return "light";');
  });

  it("provides workspace switching and admin tenant links", () => {
    expect(nav).toContain("Business workspace");
    expect(nav).toContain("/api/clients");
    expect(nav).toContain("workspace-switcher");
    expect(admin).toContain("Manage members →");
    expect(admin).toContain("/clients/${org.id}");
    expect(admin).toContain("/clients/${org.id}/members");
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
    expect(assess).toContain('aria-label="Capability to assess"');
    expect(assess).not.toContain('className="assessment-layout"');
    expect(assess).not.toContain("assessment-capability-option");
    expect(assess).not.toMatch(/<nav\b/);
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
    expect(assess).toContain("Assessment decision and sign-off");
    expect(assess).toContain("Append-only history");
    expect(assess).toContain("Request evidence");
    expect(assess).toContain("Sign off");
    expect(assess).toContain("Approved insights and priorities");
    expect(assess).toContain("Create insight");
    expect(assess).toContain("Traceable to signed-off decision");
    expect(assess).toContain("Growth actions");
    expect(assess).toContain("Add growth action");
    expect(assess).toContain("Action owner");
    expect(assess).toContain("Due date");
    expect(assess).toContain("ownerEmail");
    expect(assess).toContain("dueDate");
    expect(assess).toContain("Create recommendation");
    expect(assess).toContain("growthActionId");
    expect(assess).toContain("Recommendation created");
    expect(assess).toContain("Recommendation could not be created");
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

  it("keeps overall maturity readable in dark-mode gap analysis", () => {
    expect(analysis).toContain("Overall Maturity");
    expect(analysis).toContain("text-[var(--stat-value)]");
    expect(analysis).not.toContain("text-[var(--primary)]");
    expect(css).toContain("--stat-value: #0642bf");
    expect(css).toContain("--stat-value: var(--accent)");
  });

  it("shows clearly labelled report examples", () => {
    expect(report).toContain("Report examples");
    expect(report).toContain("Example: Executive snapshot");
    expect(report).toContain("Example output");
  });

  it("keeps platform administration inside the responsive Flowstate theme", () => {
    expect(admin).toContain("admin-shell");
    expect(admin).toContain("ThemeToggle");
    expect(admin).toContain("workspace-card");
    expect(admin).toContain("Search users and organisations");
    expect(admin).toContain("filteredUsers");
    expect(admin).toContain("filteredOrganizations");
    expect(css).toContain(".admin-search-input");
    expect(css).toContain(".workspace-context-button .workspace-context-label, .workspace-context-button .workspace-context-name { display: block;");
    expect(css).toContain("overflow-x: hidden");
    expect(navbar).toContain("Platform admin");
    expect(navbar).toContain("/api/admin/users");
    expect(admin).toContain("aria-label={`Global role for ${user.email}`}");
    expect(css).toContain(".admin-shell");
    expect(css).toContain("@media (max-width: 800px)");
    expect(css).toContain(".admin-summary-grid");
  });

  it("uses Flowstate dialogs instead of native browser prompts", () => {
    expect(configure).not.toMatch(/\b(prompt|confirm)\s*\(/);
    expect(configure).toContain("FlowstateDialog");
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain("aria-modal=\"true\"");
  });

  it("closes the mobile navigation whenever the route changes", () => {
    expect(nav).toContain("setOpen(false);\n      setWorkspacePickerOpen(false);");
    expect(nav).toContain("}, [pathname]);");
  });

  it("keeps the mobile navigation panel inside the viewport", () => {
    expect(css).toContain("width: 15.5rem;");
    expect(css).toContain(".workspace-navigation-panel { display: flex;");
    expect(css).toContain(".workspace-content { min-width: 0; flex: 1; }");
  });
});
