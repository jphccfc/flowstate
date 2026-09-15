import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient, hasOrganizationPermission } from "@/lib/auth/organization";
import { normalizeAgentAlias, validateAgentAlias } from "@/lib/agents/identity";

async function authenticatedUser() {
  return (await (await createClient()).auth.getUser()).data.user;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = await params;
  const user = await authenticatedUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessClient(user.email, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const agents = await prisma.agentDefinition.findMany({
    where: { publishedPromptVersionId: { not: null } },
    orderBy: { name: "asc" },
    select: { key: true, name: true, agentType: true, organizationProfiles: { where: { organizationId }, select: { displayName: true, alias: true, normalizedAlias: true } } },
  });
  return NextResponse.json(agents.map((agent) => ({ key: agent.key, globalName: agent.name, agentType: agent.agentType, displayName: agent.organizationProfiles[0]?.displayName ?? agent.name, alias: agent.organizationProfiles[0]?.alias ?? null })));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = await params;
  const user = await authenticatedUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, organizationId, "client.configure"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { agentKey?: unknown; displayName?: unknown; alias?: unknown } | null;
  const agentKey = typeof body?.agentKey === "string" ? body.agentKey : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  const alias = typeof body?.alias === "string" ? body.alias.trim() : "";
  if (!agentKey || !displayName || !validateAgentAlias(alias)) return NextResponse.json({ error: "agentKey, displayName and a valid alias are required" }, { status: 400 });
  const agent = await prisma.agentDefinition.findFirst({ where: { key: agentKey, publishedPromptVersionId: { not: null } }, select: { id: true, key: true, name: true, agentType: true } });
  if (!agent) return NextResponse.json({ error: "Published agent not found" }, { status: 404 });
  try {
    const profile = await prisma.organizationAgentProfile.upsert({
      where: { organizationId_agentDefinitionId: { organizationId, agentDefinitionId: agent.id } },
      create: { organizationId, agentDefinitionId: agent.id, displayName, alias, normalizedAlias: normalizeAgentAlias(alias) },
      update: { displayName, alias, normalizedAlias: normalizeAgentAlias(alias) },
      select: { displayName: true, alias: true, updatedAt: true },
    });
    return NextResponse.json({ key: agent.key, globalName: agent.name, agentType: agent.agentType, ...profile });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return NextResponse.json({ error: "That alias is already used in this client workspace" }, { status: 409 });
    throw error;
  }
}
