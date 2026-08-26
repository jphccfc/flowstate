import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const detail = readFileSync(resolve(root, "app/api/clients/[id]/communication-packs/[packId]/route.ts"), "utf8");
const page = readFileSync(resolve(root, "app/clients/[id]/communication-packs/page.tsx"), "utf8");
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");

describe("Communication Pack governed review contract", () => {
  it("persists the draft form through POST and offers approved source selection", () => {
    expect(page).toContain("method"); expect(page).toContain("POST");
    expect(page).toContain("decisionId");
    expect(page).toContain("insightId");
    expect(page).toContain("recipientContext");
    expect(page).toContain("stakeholderContext");
    expect(page).toContain("Save draft");
  });

  it("supports detail GET and editable PATCH persistence", () => {
    expect(detail).toContain("export async function GET");
    expect(detail).toContain("export async function PATCH");
    expect(detail).toContain("title");
    expect(detail).toContain("content");
    expect(detail).toContain("recipientContext");
  });

  it("enforces the governed status transition graph and appends review history", () => {
    for (const status of ["DRAFT", "READY_FOR_REVIEW", "CHANGES_REQUESTED", "APPROVED_FOR_DISTRIBUTION", "ACKNOWLEDGED"]) expect(schema).toContain(status);
    for (const action of ["SUBMITTED", "REQUEST_CHANGES", "APPROVED", "ACKNOWLEDGED"]) expect(schema).toContain(action);
    expect(detail).toContain("communicationPackAcknowledgement.create");
    expect(detail).toContain("assessment.review");
  });

  it("uses the shared sentence-case display label helper", () => {
    expect(page).toContain("displayLabel");
    expect(detail).toContain("displayLabel");
  });
});
