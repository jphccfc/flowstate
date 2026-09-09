import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/organization";
import { requestChatCompletion } from "@/lib/ai/client";
import { formatWorkspaceContext, rankWorkspaceSources, type WorkspaceSource } from "@/lib/ai/hub";

const MAX_QUESTION_LENGTH = 1000;

async function actor() {
  return (await (await createClient()).auth.getUser()).data.user;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await actor();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: organizationId } = await params;
  if (!(await canAccessClient(user.email, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });
  if (question.length > MAX_QUESTION_LENGTH) return NextResponse.json({ error: "question is too long" }, { status: 400 });

  const [capturedInputs, meetingContexts, projects, kpis, achievements, agent] = await Promise.all([
    prisma.capturedInput.findMany({ where: { organizationId, status: { not: "QUARANTINED" } }, orderBy: { capturedAt: "desc" }, take: 250, select: { id: true, type: true, subject: true, sourceRef: true, rawText: true, capturedAt: true } }),
    prisma.meetingContext.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, title: true, startsAt: true, dateTime: true, objectives: true, agendaItems: true, desiredOutcome: true } }),
    prisma.project.findMany({ where: { organizationId }, select: { id: true, name: true, objective: true, status: true, timeline: true, outcomes: true, updatedAt: true } }),
    prisma.kPI.findMany({ where: { organizationId }, select: { id: true, name: true, description: true, targetValue: true, currentValue: true, dataSource: true, updatedAt: true } }),
    prisma.achievement.findMany({ where: { organizationId }, select: { id: true, description: true, targetDate: true, successMetrics: true, status: true, updatedAt: true } }),
    prisma.agentDefinition.findFirst({ where: { publishedPromptVersionId: { not: null }, OR: [{ key: "client_ai_hub" }, { name: { contains: "AI Hub", mode: "insensitive" } }] }, select: { name: true, publishedPromptVersion: { select: { prompt: true, version: true } } } }),
  ]);

  const sources: WorkspaceSource[] = [
    ...capturedInputs.filter((input) => input.rawText?.trim()).map((input) => ({ id: input.id, kind: input.type === "DOCUMENT" || input.type === "DATA_ROOM_FILE" ? "document" : input.type.toLowerCase(), title: input.subject || input.sourceRef || `${input.type} capture`, date: input.capturedAt, text: input.rawText! })),
    ...meetingContexts.map((meeting) => ({ id: meeting.id, kind: "meeting agenda", title: meeting.title, date: meeting.startsAt ?? meeting.dateTime ?? new Date(), text: [meeting.objectives, meeting.agendaItems.join("; "), meeting.desiredOutcome].filter(Boolean).join("\n") })),
    ...projects.map((project) => ({ id: project.id, kind: "project record", title: project.name, date: project.updatedAt, text: [project.objective, project.status, project.timeline, project.outcomes].filter(Boolean).join("\n") })),
    ...kpis.map((kpi) => ({ id: kpi.id, kind: "KPI record", title: kpi.name, date: kpi.updatedAt, text: [kpi.description, `Target: ${kpi.targetValue ?? "not set"}`, `Current: ${kpi.currentValue ?? "not set"}`, kpi.dataSource].filter(Boolean).join("\n") })),
    ...achievements.map((achievement) => ({ id: achievement.id, kind: "achievement record", title: achievement.description, date: achievement.updatedAt, text: [achievement.description, achievement.successMetrics, achievement.status, achievement.targetDate?.toISOString()].filter(Boolean).join("\n") })),
  ];
  const rankedSources = rankWorkspaceSources(question, sources);
  if (rankedSources.length === 0) return NextResponse.json({ answer: "I could not find a matching source in this workspace.", sources: [], limitation: "AI Hub searches authorized workspace text and records using keyword relevance; it does not search external systems or unindexed content." });
  if (!agent?.publishedPromptVersion) return NextResponse.json({ error: "AI Hub is not configured with a published agent prompt." }, { status: 503 });

  try {
    const answer = await requestChatCompletion({
      system: `${agent.publishedPromptVersion.prompt}\n\nYou are the client-facing AI Hub. Answer only from the supplied workspace context. Do not invent facts. Mention uncertainty and cite sources as [1], [2], etc. Outputs are provisional and read-only.`,
      user: `Question: ${question}\n\nAuthorized workspace context:\n${formatWorkspaceContext(rankedSources)}`,
      maxTokens: 700,
    });
    return NextResponse.json({ answer, sources: rankedSources.map((source) => ({ id: source.id, kind: source.kind, title: source.title, date: source.date.toISOString(), excerpt: source.excerpt })), agent: { name: agent.name, promptVersion: agent.publishedPromptVersion.version }, limitation: "AI Hub uses deterministic keyword relevance over currently indexed workspace records and the published agent prompt. Verify important answers against the cited source." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI provider request failed";
    const configurationError = [
      "AI gateway is not configured",
      "OpenAI API key is not configured",
      "AI model is not configured",
    ].includes(message);
    return NextResponse.json({ error: message }, { status: configurationError ? 503 : 502 });
  }
}
