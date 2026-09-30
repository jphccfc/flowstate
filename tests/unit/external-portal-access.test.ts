import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const access = readFileSync(resolve(root, "lib/auth/external-portal.ts"), "utf8");

describe("FS-22 external portal access boundary", () => {
  it("models portal membership and person-level task and meeting assignment", () => {
    expect(schema).toContain("model StakeholderPortalMembership");
    expect(schema).toContain("model AssessmentTaskStakeholder");
    expect(schema).toContain("model MeetingContextStakeholder");
    expect(schema).toContain("model AssessmentTaskActivity");
  });

  it("fails closed and projects only the permitted external task fields", () => {
    expect(access).toContain("resolveExternalPortalAccess");
    expect(access).toContain("assignmentWhere");
    expect(access).toContain("externalTaskSelect");
    expect(access).toContain("return null");
    expect(access).not.toContain("completionNote: true");
    expect(access).not.toContain("linkedDecisionId: true");
  });
});
