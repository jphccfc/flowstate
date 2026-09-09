import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationMembership, hasOrganizationPermission } from "@/lib/auth/organization";

const types = ["EVIDENCE_REQUEST", "INTERVIEW", "FOLLOW_UP", "VALIDATION", "REVIEW", "SIGN_OFF", "REPORT_PREPARATION"] as const;
const statuses = ["OPEN", "AWAITING_INPUT", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
const reviewStates = ["NOT_REQUIRED", "PENDING_HUMAN_REVIEW", "APPROVED", "REJECTED"] as const;

async function user() { return (await (await createClient()).auth.getUser()).data.user; }
function valid(value: unknown, values: readonly string[]): value is string { return typeof value === "string" && values.includes(value); }

async function validateLinks(body: Record<string, unknown>, organizationId: string) {
  const linkedEvidenceId = typeof body.linkedEvidenceId === "string" ? body.linkedEvidenceId.trim() : "";
  const linkedCapabilityId = typeof body.linkedCapabilityId === "string" ? body.linkedCapabilityId.trim() : "";
  const linkedDecisionId = typeof body.linkedDecisionId === "string" ? body.linkedDecisionId.trim() : "";
  const linkedReportSection = typeof body.linkedReportSection === "string" ? body.linkedReportSection.trim() : "";
  if (linkedReportSection.length > 200) return { error: "Report section must be 200 characters or fewer" };
  if (linkedEvidenceId && !(await prisma.tag.findFirst({ where: { id: linkedEvidenceId, status: { in: ["AUTO_APPROVED", "APPROVED"] }, segment: { capturedInput: { organizationId } } }, select: { id: true } }))) return { error: "Linked evidence must belong to this organisation" };
  if (linkedCapabilityId && !(await prisma.capability.findFirst({ where: { id: linkedCapabilityId, domain: { organizationId } }, select: { id: true } }))) return { error: "Linked capability must belong to this organisation" };
  if (linkedDecisionId && !(await prisma.assessmentDecision.findFirst({ where: { id: linkedDecisionId, capability: { domain: { organizationId } } }, select: { id: true } }))) return { error: "Linked decision must belong to this organisation" };
  return { linkedEvidenceId: linkedEvidenceId || null, linkedCapabilityId: linkedCapabilityId || null, linkedDecisionId: linkedDecisionId || null, linkedReportSection: linkedReportSection || null };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const current = await user(); const { id } = await params;
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(current.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tasks = await prisma.assessmentTask.findMany({ where: { organizationId: id }, orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { assignee: { select: { id: true, name: true, email: true } }, requester: { select: { name: true, email: true } }, completedBy: { select: { name: true, email: true } } } });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const current = await user(); const { id } = await params;
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(current.email, id, "assessment.submit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const membership = await getOrganizationMembership(current.email, id); if (!membership) return NextResponse.json({ error: "Organisation membership required" }, { status: 403 });
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const dueDate = typeof body.dueDate === "string" ? new Date(body.dueDate) : null;
  if (!title || !description || !dueDate || Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: "Title, description and due date are required" }, { status: 400 });
  if (!valid(body.type, types)) return NextResponse.json({ error: "A valid assessment task type is required" }, { status: 400 });
  const assigneeId = typeof body.assigneeId === "string" ? body.assigneeId : membership.userId;
  const assignee = await prisma.userOrganization.findFirst({ where: { organizationId: id, userId: assigneeId }, select: { userId: true } });
  if (!assignee) return NextResponse.json({ error: "Assignee must belong to this organisation" }, { status: 400 });
  const links = await validateLinks(body, id); if ("error" in links) return NextResponse.json({ error: links.error }, { status: 400 });
  const task = await prisma.assessmentTask.create({ data: { organizationId: id, requesterId: membership.userId, assigneeId, type: body.type, title, description, context: typeof body.context === "string" ? body.context.trim() || null : null, dueDate, priority: Number.isInteger(body.priority) ? Math.min(5, Math.max(1, body.priority)) : 3, humanReviewState: body.type === "REVIEW" || body.type === "SIGN_OFF" ? "PENDING_HUMAN_REVIEW" : "NOT_REQUIRED", ...links }, include: { assignee: { select: { id: true, name: true, email: true } } } });
  return NextResponse.json(task, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const current = await user(); const { id } = await params; const body = await req.json();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(current.email, id, "assessment.submit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (typeof body.taskId !== "string") return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  const task = await prisma.assessmentTask.findFirst({ where: { id: body.taskId, organizationId: id } }); if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (valid(body.type, types)) data.type = body.type;
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.description === "string" && body.description.trim()) data.description = body.description.trim();
  if (typeof body.context === "string") data.context = body.context.trim() || null;
  if (typeof body.dueDate === "string") { const dueDate = new Date(body.dueDate); if (Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: "A valid due date is required" }, { status: 400 }); data.dueDate = dueDate; }
  if (Number.isInteger(body.priority)) data.priority = Math.min(5, Math.max(1, body.priority));
  if (typeof body.assigneeId === "string") { const assignee = await prisma.userOrganization.findFirst({ where: { organizationId: id, userId: body.assigneeId }, select: { userId: true } }); if (!assignee) return NextResponse.json({ error: "Assignee must belong to this organisation" }, { status: 400 }); data.assigneeId = assignee.userId; }
  if (["linkedEvidenceId", "linkedCapabilityId", "linkedDecisionId", "linkedReportSection"].some((key) => key in body)) { const links = await validateLinks(body, id); if ("error" in links) return NextResponse.json({ error: links.error }, { status: 400 }); Object.assign(data, links); }
  if (valid(body.status, statuses)) data.status = body.status;
  if (valid(body.humanReviewState, reviewStates)) { if (!(await hasOrganizationPermission(current.email, id, "assessment.review"))) return NextResponse.json({ error: "Human review permission required" }, { status: 403 }); data.humanReviewState = body.humanReviewState; }
  if (typeof body.completionNote === "string") data.completionNote = body.completionNote.trim() || null;
  if (data.status === "COMPLETED") { if (task.type === "SIGN_OFF" && data.humanReviewState !== "APPROVED" && task.humanReviewState !== "APPROVED") return NextResponse.json({ error: "Sign-off tasks require authorised human approval before completion" }, { status: 400 }); data.completedAt = new Date(); const completed = await prisma.user.findUnique({ where: { email: current.email }, select: { id: true } }); data.completedById = completed?.id ?? null; }
  else if (data.status && data.status !== "COMPLETED") { data.completedAt = null; data.completedById = null; }
  const updated = await prisma.assessmentTask.update({ where: { id: task.id }, data, include: { assignee: { select: { id: true, name: true, email: true } }, requester: { select: { name: true, email: true } } } });
  return NextResponse.json(updated);
}
