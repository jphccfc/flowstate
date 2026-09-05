import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/assess/page.tsx"), "utf8");

describe("assessment completion UI contract", () => {
  it("shows capability completion progress before selecting a capability", () => {
    expect(page).toContain("Assessment progress");
    expect(page).toContain("completedCapabilities");
    expect(page).toContain('aria-label="Assessment progress"');
  });

  it("confirms that saved values were reloaded and provides actionable load errors", () => {
    expect(page).toContain("Assessment saved and reloaded");
    expect(page).toContain("Try again");
    expect(page).toContain('role="alert"');
  });
});
