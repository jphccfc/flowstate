import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "suggest-advisor@test.com" } } }) },
  }),
}));

import { GET as listSuggestions } from "../../app/api/sessions/[id]/suggestions/route";
import { PATCH as patchSuggestion } from "../../app/api/suggestions/[id]/route";

describe("suggestions routes", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("lists SHOWN suggestions for a session, excluding ASKED/DISMISSED ones, then dismisses one", async () => {
    const org = await createTestOrganization({ name: "Suggestions Route Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `suggest-advisor2-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    const shown = await prisma.followUpSuggestion.create({
      data: { sessionId: session.id, suggestedQuestion: "Shown question", status: "SHOWN" },
    });
    await prisma.followUpSuggestion.create({
      data: { sessionId: session.id, suggestedQuestion: "Already dismissed", status: "DISMISSED" },
    });

    const listRes = await listSuggestions(
      new Request("http://localhost/api/sessions/" + session.id + "/suggestions") as never,
      { params: Promise.resolve({ id: session.id }) }
    );
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(shown.id);

    const patchRes = await patchSuggestion(
      new Request("http://localhost/api/suggestions/" + shown.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "dismiss" }),
      }) as never,
      { params: Promise.resolve({ id: shown.id }) }
    );
    expect(patchRes.status).toBe(200);
    const dismissed = await patchRes.json();
    expect(dismissed.status).toBe("DISMISSED");
  });

  it("marks a suggestion ASKED", async () => {
    const org = await createTestOrganization({ name: "Suggestions Ask Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `suggest-advisor3-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });
    const suggestion = await prisma.followUpSuggestion.create({
      data: { sessionId: session.id, suggestedQuestion: "Ask this?", status: "SHOWN" },
    });

    const res = await patchSuggestion(
      new Request("http://localhost/api/suggestions/" + suggestion.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "ask" }),
      }) as never,
      { params: Promise.resolve({ id: suggestion.id }) }
    );
    const updated = await res.json();
    expect(updated.status).toBe("ASKED");
  });
});
