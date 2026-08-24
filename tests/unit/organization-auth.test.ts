import { describe, expect, it } from "vitest";
import { hasPermission, permissionsForRole } from "@/lib/auth/organization";

describe("organization role permissions", () => {
  it("allows advisors to manage assigned client organisations", () => {
    expect(hasPermission("ADVISOR", "members.manage")).toBe(true);
    expect(hasPermission("ADVISOR", "assessment.approve")).toBe(true);
  });

  it("limits client stakeholders to evidence and perspective work", () => {
    expect(hasPermission("CLIENT_STAKEHOLDER", "evidence.create")).toBe(true);
    expect(hasPermission("CLIENT_STAKEHOLDER", "assessment.submit")).toBe(true);
    expect(hasPermission("CLIENT_STAKEHOLDER", "assessment.approve")).toBe(false);
    expect(hasPermission("CLIENT_STAKEHOLDER", "members.manage")).toBe(false);
  });

  it("makes investors read-only report users", () => {
    expect(hasPermission("INVESTOR", "reports.read")).toBe(true);
    expect(hasPermission("INVESTOR", "evidence.create")).toBe(false);
    expect(hasPermission("INVESTOR", "assessment.signoff")).toBe(false);
  });

  it("gives system administrators every permission", () => {
    expect(hasPermission("SYSTEM_ADMIN", "members.manage")).toBe(true);
    expect(hasPermission("SYSTEM_ADMIN", "assessment.signoff")).toBe(true);
  });

  it("exposes a stable permission list for the member-management UI", () => {
    expect(permissionsForRole("CLIENT_EXECUTIVE")).toContain("assessment.signoff");
    expect(permissionsForRole("CLIENT_EXECUTIVE")).not.toContain("members.manage");
  });
});
