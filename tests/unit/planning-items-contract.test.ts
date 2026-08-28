import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const route = readFileSync(resolve(root, "app/api/clients/[id]/planning-items/route.ts"), "utf8");
const page = readFileSync(resolve(root, "app/clients/[id]/planning/page.tsx"), "utf8");
const members = readFileSync(resolve(root, "app/api/clients/[id]/members/route.ts"), "utf8");

describe("PlanningItem contract", () => {
  it("defines the four planning item types and lifecycle fields", () => {
    expect(schema).toContain("enum PlanningItemType");
    for (const type of ["REQUIREMENT", "SPECIFICATION", "GOAL", "OBJECTIVE"]) expect(schema).toContain(type);
    for (const field of ["ownerEmail", "targetDate", "lifecycleStatus", "humanApprovalState", "createdBy", "approvedBy", "approvedAt", "parentId", "approvedInsightId"]) expect(schema).toContain(field);
  });

  it("exposes an organisation-scoped capture and visible result contract", () => {
    expect(route).toContain("where: { organizationId: id }");
    expect(route).toContain("assessment.submit");
    expect(route).toContain("assessment.review");
    expect(page).toContain("Add planning item");
    expect(page).toContain("/members");
    expect(page).toContain("member.email");
    expect(page).toContain("editingItem");
    expect(page).toContain("method: \"PATCH\"");
    expect(route).toContain("data.title");
    expect(route).toContain("data.ownerEmail");
    expect(page).toContain("lifecycleStatus");
    expect(page).toContain("humanApprovalState");
    expect(members).toContain("members.read");
    expect(page).toContain("No planning items yet");
    expect(page).toContain("approvedInsightId");
    expect(page).toContain("Approved insight");
    expect(page).toContain("Source decision");
    expect(page).toContain("Source evidence");
    expect(page).toContain("Source perspective");
    expect(route).toContain("sourceEvidence");
    expect(route).toContain("sourcePerspectives");
    expect(page).toContain("segmentText");
    expect(page).toContain("sourceType");
    expect(page).toContain("sourceRef");
    expect(page).toContain("stakeholderType");
    expect(page).toContain("statement");
  });
});
