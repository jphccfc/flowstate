import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
const currentEmail = "advisor@test.com";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: currentEmail } } }) } }) }));
vi.mock("@/lib/ingestion/pipeline", () => ({ processCapturedInput: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (fn: () => unknown) => fn() }));
import { GET as listContexts, POST as createContext } from "../../app/api/meeting-contexts/route";
import { PATCH as updateContext } from "../../app/api/meeting-contexts/[id]/route";
import { POST as createInput } from "../../app/api/captured-inputs/route";
function jsonRequest(url: string, body: unknown, method = "POST") { return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never; }
function formRequest(fields: Record<string, string>) { const formData = new FormData(); Object.entries(fields).forEach(([key, value]) => formData.set(key, value)); return new Request("http://localhost/api/captured-inputs", { method: "POST", body: formData }) as never; }
describe("meeting context routes", () => {
  let orgId = "";
  beforeAll(async () => { orgId = (await createTestOrganization({ name: "Meeting Context Org" })).id; });
  afterAll(async () => { await cleanupOrganization(orgId); await prisma.$disconnect(); });
  it("creates and updates an incomplete context, then lists it for the organization", async () => {
    const createdResponse = await createContext(jsonRequest("http://localhost/api/meeting-contexts", { organizationId: orgId, title: "Finance discovery", stakeholderName: "Pat", objectives: "Understand close process" }));
    expect(createdResponse.status).toBe(201); const created = await createdResponse.json(); expect(created.title).toBe("Finance discovery"); expect(created.agendaItems).toEqual([]); expect(created.stakeholders).toEqual([]);
    const updateResponse = await updateContext(jsonRequest(`http://localhost/api/meeting-contexts/${created.id}`, { agendaItems: ["Current close", "Pain points"], desiredOutcome: "Prioritized opportunities" }, "PATCH"), { params: Promise.resolve({ id: created.id }) });
    expect(updateResponse.status).toBe(200); expect((await updateResponse.json()).desiredOutcome).toBe("Prioritized opportunities");
    const listResponse = await listContexts(new Request(`http://localhost/api/meeting-contexts?organizationId=${orgId}`) as never); expect((await listResponse.json()).some((context: { id: string }) => context.id === created.id)).toBe(true);
  });
  it("links a typed capture to an incomplete meeting context without changing raw evidence", async () => {
    const context = await prisma.meetingContext.create({ data: { organizationId: orgId, title: "Operations check-in" } });
    const response = await createInput(formRequest({ organizationId: orgId, type: "TEXT_NOTE", rawText: "Raw note /not parsed/", meetingContextId: context.id }));
    expect(response.status).toBe(201); const created = await response.json(); expect(created.meetingContextId).toBe(context.id); expect(created.rawText).toBe("Raw note /not parsed/"); expect(created.revision).toBe(0);
  });
});
