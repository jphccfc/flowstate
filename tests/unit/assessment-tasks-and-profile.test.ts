import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const nav = readFileSync(resolve(root, "components/layout/WorkspaceNav.tsx"), "utf8");
const overview = readFileSync(resolve(root, "app/clients/[id]/page.tsx"), "utf8");
const profile = readFileSync(resolve(root, "app/profile/page.tsx"), "utf8");

describe("Assessment Tasks and profile workflow", () => {
  it("exposes Assessment Tasks in the workspace navigation", () => {
    expect(nav).toContain('label: "Assessment tasks"');
    expect(nav).toContain('/tasks');
  });

  it("links the overview to a real task workflow", () => {
    expect(overview).toContain('/tasks');
    expect(overview).toContain("Raise assessment task");
  });

  it("provides authenticated profile navigation", () => {
    expect(nav).toContain('href="/profile"');
    expect(nav).toContain("Profile");
  });

  it("keeps the authenticated profile inside the main navigation shell", () => {
    expect(profile).toContain("<Navbar />");
    expect(profile).toContain('href="/dashboard"');
    expect(profile).toContain("Back to main menu");
  });

  it("defines the separate assessment task model", () => {
    const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model AssessmentTask");
    expect(schema).toContain("enum AssessmentTaskType");
    expect(schema).toContain("enum AssessmentTaskStatus");
    expect(schema).toContain("humanReviewState");
  });
});
