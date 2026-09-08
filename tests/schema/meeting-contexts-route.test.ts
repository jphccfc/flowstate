import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

let currentEmail = "advisor@test.com";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: currentEmail } } }) },
  }),
}));

import { GET, POST } from "../../app/api/meeting-contexts/route";

const request = (body: unknown) => new Request("http://localhost/api/meeting-contexts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}) as never;

describe("meeting context Capture Evidence contract", () => {
  let organizationId = "";

  beforeEach(() => {
    currentEmail = "advisor@test.com";
  });

  afterEach(async () => {
    if (organizationId) await cleanupOrganization(organizationId);
    organizationId = "";
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates an optional meeting agenda context with date/time, stakeholders, domain, objectives, and outcome", async () => {
    const organization = await createTestOrganization({ name: "Meeting Context Contract Org" });
    organizationId = organization.id;

    const response = await POST(request({
      organizationId,
      title: "Quarterly operating review",
      dateTime: "2026-09-10T13:30:00.000Z",
      stakeholders: ["Alex Morgan", "Priya Shah"],
      domain: "Operations",
      objectives: "Understand the current handoffs.",
      agendaItems: ["Current state", "Constraints"],
      desiredOutcome: "Agree next steps.",
    }));

    expect(response.status).toBe(201);
    const context = await response.json();
    expect(context.title).toBe("Quarterly operating review");
    expect(context.dateTime).toBe("2026-09-10T13:30:00.000Z");
    expect(context.stakeholders).toEqual(["Alex Morgan", "Priya Shah"]);
    expect(context.domain).toBe("Operations");
    expect(context.objectives).toBe("Understand the current handoffs.");
    expect(context.agendaItems).toEqual(["Current state", "Constraints"]);
    expect(context.desiredOutcome).toBe("Agree next steps.");
  });

  it("keeps context optional while allowing multiple raw captures to link to it", async () => {
    const organization = await createTestOrganization({ name: "Meeting Context Link Org" });
    organizationId = organization.id;
    const context = await prisma.meetingContext.create({ data: { organizationId, title: "Optional context" } });

    const first = await prisma.capturedInput.create({ data: { organizationId, meetingContextId: context.id, type: "TEXT_NOTE", rawText: "First raw note", status: "TRANSCRIBED" } });
    const second = await prisma.capturedInput.create({ data: { organizationId, meetingContextId: context.id, type: "TEXT_NOTE", rawText: "Second raw note", status: "TRANSCRIBED" } });

    const response = await GET(new Request(`http://localhost/api/meeting-contexts?organizationId=${organizationId}`) as never);
    expect(response.status).toBe(200);
    const listed = await response.json();
    const listedContext = listed.find((item: { id: string }) => item.id === context.id);
    expect(listedContext._count.capturedInputs).toBe(2);
    expect(first.meetingContextId).toBe(second.meetingContextId);
  });
});
