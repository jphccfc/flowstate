import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/data-room/route.ts"), "utf8");
const capturedInputsRoute = readFileSync(resolve(process.cwd(), "app/api/captured-inputs/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/data-room/page.tsx"), "utf8");

describe("Data Room evidence linking and cancellation", () => {
  it("validates a linked evidence input is in the client workspace and not quarantined", () => {
    expect(route).toContain("linkedInputId");
    expect(route).toContain("organizationId: id");
    expect(route).toContain('status: { not: "QUARANTINED" }');
  });

  it("offers an evidence link action and cancels populated packs rather than deleting them", () => {
    expect(page).toContain("Link evidence");
    expect(page).toContain("Cancel request pack");
    expect(page).toContain('status: "CANCELLED"');
    expect(page).toContain("/api/captured-inputs?organizationId=");
    expect(capturedInputsRoute).toContain("attachments: { select: { filename: true }");
    expect(capturedInputsRoute).toContain("meetingContext: { select: { title: true } }");
    expect(page).toContain("input.attachments[0]?.filename");
  });
});
