import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "agent-admin", email: "agent-admin@test.com" } } }) } }),
}));

import { GET, POST } from "../../app/api/admin/agents/route";
import { POST as createVersion } from "../../app/api/admin/agents/[id]/versions/route";
import { POST as publishVersion } from "../../app/api/admin/agents/[id]/publish/route";

const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("system-admin agent catalogue contract", () => {
  beforeAll(async () => {
    await prisma.user.upsert({ where: { email: "agent-admin@test.com" }, update: { role: "SYSTEM_ADMIN" }, create: { id: "agent-admin", email: "agent-admin@test.com", role: "SYSTEM_ADMIN" } });
  });
  afterAll(async () => {
    await prisma.agentDefinition.deleteMany({ where: { key: { startsWith: "test-agent-" } } });
    await prisma.user.update({ where: { email: "agent-admin@test.com" }, data: { role: "ADVISOR" } });
    await prisma.$disconnect();
  });
  it("creates a global definition with an immutable initial prompt and safe input scopes", async () => {
    const response = (await POST(jsonRequest("http://localhost/api/admin/agents", { key: `test-agent-${Date.now()}`, name: "Evidence triage", description: "Classifies captured evidence for human review.", prompt: "Classify only; never approve or communicate.", changeReason: "Initial catalogue entry", inputRules: [{ inputType: "TEXT_NOTE", domainIdentifier: "operations" }] })))!;
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.agent.promptVersions).toHaveLength(1); expect(body.agent.promptVersions[0].version).toBe(1); expect(body.agent.inputRules[0].domainIdentifier).toBe("operations");
  });
  it("creates a new prompt version without mutating the prior version and publishes explicitly", async () => {
    const created = (await POST(jsonRequest("http://localhost/api/admin/agents", { key: `test-agent-${Date.now()}-versioned`, name: "Versioned agent", prompt: "First prompt", changeReason: "Initial" })))!;
    const agent = (await created.json()).agent;
    const versionResponse = await createVersion(jsonRequest(`http://localhost/api/admin/agents/${agent.id}/versions`, { prompt: "Second prompt", changeReason: "Clarified scope" }), { params: Promise.resolve({ id: agent.id }) });
    expect(versionResponse.status).toBe(201); const version = (await versionResponse.json()).version; expect(version.version).toBe(2);
    expect((await prisma.agentPromptVersion.findUniqueOrThrow({ where: { id: agent.promptVersions[0].id } })).prompt).toBe("First prompt");
    const publishResponse = await publishVersion(jsonRequest(`http://localhost/api/admin/agents/${agent.id}/publish`, { versionId: version.id }), { params: Promise.resolve({ id: agent.id }) });
    expect(publishResponse.status).toBe(200);
    const published = await prisma.agentDefinition.findUniqueOrThrow({ where: { id: agent.id }, include: { publishedPromptVersion: true } });
    expect(published.publishedPromptVersion?.id).toBe(version.id); expect(published.publishedPromptVersion?.publishedBy).toBe("agent-admin@test.com"); expect(published.publishedPromptVersion?.publishedAt).toBeTruthy();
  });
  it("rejects unsafe input scope identifiers", async () => {
    const response = (await POST(jsonRequest("http://localhost/api/admin/agents", { key: `test-agent-${Date.now()}-unsafe`, name: "Unsafe", prompt: "No execution", changeReason: "Test", inputRules: [{ inputType: "TEXT_NOTE", domainIdentifier: "operations; DROP TABLE users" }] })))!;
    expect(response.status).toBe(400);
  });
  it("rejects non-system-admin catalogue access", async () => {
    await prisma.user.update({ where: { email: "agent-admin@test.com" }, data: { role: "ADVISOR" } }); const response = (await GET())!; expect(response.status).toBe(403); await prisma.user.update({ where: { email: "agent-admin@test.com" }, data: { role: "SYSTEM_ADMIN" } });
  });
});
