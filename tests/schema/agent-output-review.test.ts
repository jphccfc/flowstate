import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

const currentEmail = "advisor@test.com";
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: currentEmail } } }) } }),
}));

import { GET as listOutputs } from "../../app/api/clients/[id]/agent-outputs/route";
import { PATCH as reviewOutput } from "../../app/api/agent-outputs/[id]/route";

describe("human review of provisional agent outputs", () => {
  let organizationId = "";
  let foreignOrganizationId = "";
  let outputId = "";

  afterAll(async () => {
    if (organizationId) await cleanupOrganization(organizationId);
    if (foreignOrganizationId) await prisma.organization.delete({ where: { id: foreignOrganizationId } });
    await prisma.agentDefinition.deleteMany({ where: { key: { startsWith: "output-review-agent-" } } });
    await prisma.$disconnect();
  });

  it("lists provisional outputs with source, agent, exact prompt, provider and model metadata only within the organisation", async () => {
    const organization = await createTestOrganization({ name: "Output Review Org" });
    organizationId = organization.id;
    const foreign = await prisma.organization.create({ data: { name: "Output Review Foreign Org" } });
    foreignOrganizationId = foreign.id;
    const admin = await prisma.user.create({ data: { email: `output-review-admin-${Date.now()}@flowstate.test`, role: "SYSTEM_ADMIN" } });
    const agent = await prisma.agentDefinition.create({ data: { key: `output-review-agent-${Date.now()}`, name: "Evidence synthesizer", createdBy: admin.email, promptVersions: { create: { version: 7, prompt: "Exact review prompt v7", changeReason: "Test", authoredBy: admin.email } } }, include: { promptVersions: true } });
    const input = await prisma.capturedInput.create({ data: { organizationId, type: "TEXT_NOTE", rawText: "Source captured input", status: "TRANSCRIBED" } });
    const run = await prisma.agentRun.create({ data: { organizationId, capturedInputId: input.id, agentDefinitionId: agent.id, promptVersionId: agent.promptVersions[0].id, provider: "test-provider", model: "test-model" } });
    const output = await prisma.agentOutput.create({ data: { runId: run.id, provisionalOutput: { summary: "Candidate" }, provider: "test-provider", model: "test-model" } });
    outputId = output.id;
    const foreignInput = await prisma.capturedInput.create({ data: { organizationId: foreign.id, type: "TEXT_NOTE", rawText: "Foreign source", status: "TRANSCRIBED" } });
    const foreignRun = await prisma.agentRun.create({ data: { organizationId: foreign.id, capturedInputId: foreignInput.id, agentDefinitionId: agent.id, promptVersionId: agent.promptVersions[0].id } });
    await prisma.agentOutput.create({ data: { runId: foreignRun.id, provisionalOutput: { summary: "Foreign candidate" } } });

    const response = await listOutputs(new Request(`http://localhost/api/clients/${organizationId}/agent-outputs`), { params: Promise.resolve({ id: organizationId }) });
    expect(response.status).toBe(200);
    expect((await response.json()).outputs).toMatchObject([{ id: output.id, status: "PROVISIONAL", provisionalOutput: { summary: "Candidate" }, provider: "test-provider", model: "test-model", run: { capturedInput: { rawText: "Source captured input" }, agentDefinition: { name: "Evidence synthesizer" }, promptVersion: { version: 7, prompt: "Exact review prompt v7" } } }]);
    expect((await listOutputs(new Request("http://localhost/api/clients/foreign/agent-outputs"), { params: Promise.resolve({ id: foreign.id }) })).status).toBe(403);
  });

  it.each(["APPROVED", "REJECTED", "AMENDED"] as const)("allows an authorised reviewer to mark an output %s with notes and audit fields", async (status) => {
    const agent = await prisma.agentDefinition.findFirstOrThrow({ where: { key: { startsWith: "output-review-agent-" } }, include: { promptVersions: true } });
    const input = await prisma.capturedInput.create({ data: { organizationId, type: "TEXT_NOTE", rawText: "Another source", status: "TRANSCRIBED" } });
    const run = await prisma.agentRun.create({ data: { organizationId, capturedInputId: input.id, agentDefinitionId: agent.id, promptVersionId: agent.promptVersions[0].id } });
    const candidate = await prisma.agentOutput.create({ data: { runId: run.id, provisionalOutput: { summary: "Candidate" } } });
    const response = await reviewOutput(new Request(`http://localhost/api/agent-outputs/${candidate.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reviewNotes: `Human ${status.toLowerCase()} note` }) }), { params: Promise.resolve({ id: candidate.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ output: { id: candidate.id, status, reviewNotes: `Human ${status.toLowerCase()} note`, reviewedBy: currentEmail } });
    const stored = await prisma.agentOutput.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(stored.provisionalOutput).toEqual({ summary: "Candidate" });
    expect(stored.reviewedAt).toBeTruthy();
  });

  it("does not let a second review overwrite the original or review decision", async () => {
    const first = await reviewOutput(new Request(`http://localhost/api/agent-outputs/${outputId}`, { method: "PATCH", body: JSON.stringify({ status: "APPROVED", reviewNotes: "First review" }) }), { params: Promise.resolve({ id: outputId }) });
    expect(first.status).toBe(200);
    const response = await reviewOutput(new Request(`http://localhost/api/agent-outputs/${outputId}`, { method: "PATCH", body: JSON.stringify({ status: "APPROVED", reviewNotes: "Overwrite" }) }), { params: Promise.resolve({ id: outputId }) });
    expect(response.status).toBe(409);
    expect((await prisma.agentOutput.findUniqueOrThrow({ where: { id: outputId } })).provisionalOutput).toEqual({ summary: "Candidate" });
    expect((await prisma.agentOutput.findUniqueOrThrow({ where: { id: outputId } })).reviewNotes).toBe("First review");
  });
});
