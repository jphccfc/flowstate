import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { dataRoomRequestStatuses, summarizeDataRoomRequests, type DataRoomRequestStatus } from "@/lib/data-room/progress";

async function currentUser() { return (await (await createClient()).auth.getUser()).data.user; }
async function allowed(email: string | undefined, organizationId: string, permission: "client.read" | "assessment.submit") { return Boolean(email && await hasOrganizationPermission(email, organizationId, permission)); }
function validStatus(value: unknown): value is DataRoomRequestStatus { return typeof value === "string" && (dataRoomRequestStatuses as readonly string[]).includes(value); }

async function validateLinkedInput(value: unknown, organizationId: string) {
  if (value === undefined) return { provided: false as const, linkedInputId: undefined };
  const linkedInputId = typeof value === "string" ? value.trim() : "";
  if (!linkedInputId) return { provided: true as const, linkedInputId: null };
  const input = await prisma.capturedInput.findFirst({ where: { id: linkedInputId, organizationId, status: { not: "QUARANTINED" } }, select: { id: true } });
  if (!input) return { error: "Linked evidence must belong to this client and cannot be quarantined" };
  return { provided: true as const, linkedInputId: input.id };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); const { id } = await params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await allowed(user.email, id, "client.read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const packs = await prisma.dataRoomRequestPack.findMany({
    where: { organizationId: id },
    orderBy: { createdAt: "desc" },
    include: {
      assessmentTask: { select: { id: true, title: true, status: true, dueDate: true } },
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          requests: {
            orderBy: { sortOrder: "asc" },
            include: { linkedInput: { select: { id: true, sourcePath: true, sourceRef: true } } },
          },
        },
      },
    },
  });
  return NextResponse.json(packs.map((pack) => ({ ...pack, progress: summarizeDataRoomRequests(pack.categories.flatMap((category) => category.requests)) })));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); const { id } = await params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await allowed(user.email, id, "assessment.submit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const categoryId = typeof body.categoryId === "string" ? body.categoryId : "";
  if (categoryId) {
    const requestTitle = typeof body.requestTitle === "string" ? body.requestTitle.trim() : "";
    const category = await prisma.dataRoomRequestCategory.findFirst({ where: { id: categoryId, pack: { organizationId: id } }, select: { id: true } });
    if (!category || !requestTitle) return NextResponse.json({ error: "A valid Data Room category and request title are required" }, { status: 400 });
    const previous = await prisma.dataRoomRequestItem.findFirst({ where: { categoryId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const item = await prisma.dataRoomRequestItem.create({ data: { categoryId, title: requestTitle, detail: typeof body.detail === "string" ? body.detail.trim() || null : null, sortOrder: (previous?.sortOrder ?? -1) + 1 } });
    return NextResponse.json(item, { status: 201 });
  }
  const taskId = typeof body.assessmentTaskId === "string" ? body.assessmentTaskId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const categories = Array.isArray(body.categories) ? body.categories : [];
  const task = await prisma.assessmentTask.findFirst({ where: { id: taskId, organizationId: id, type: "EVIDENCE_REQUEST" }, select: { id: true } });
  if (!task || !title || !categories.length) return NextResponse.json({ error: "An evidence-request task, title and categories are required" }, { status: 400 });
  const pack = await prisma.dataRoomRequestPack.create({ data: { organizationId: id, assessmentTaskId: task.id, title, sourceReference: typeof body.sourceReference === "string" ? body.sourceReference.trim() || null : null, categories: { create: categories.map((category: { title?: unknown; requests?: unknown[] }, categoryIndex: number) => ({ title: typeof category.title === "string" ? category.title.trim() : "Untitled category", sortOrder: categoryIndex, requests: { create: (Array.isArray(category.requests) ? category.requests : []).map((requestTitle, requestIndex) => ({ title: typeof requestTitle === "string" ? requestTitle.trim() : "Untitled request", sortOrder: requestIndex })) } })) } }, include: { categories: { include: { requests: true } } } });
  return NextResponse.json({ ...pack, progress: summarizeDataRoomRequests(pack.categories.flatMap((category) => category.requests)) }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); const { id } = await params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await allowed(user.email, id, "assessment.submit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  if (typeof body.requestId !== "string") return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  if (body.status !== undefined && !validStatus(body.status)) return NextResponse.json({ error: "A valid request status is required" }, { status: 400 });
  const item = await prisma.dataRoomRequestItem.findFirst({ where: { id: body.requestId, category: { pack: { organizationId: id } } }, select: { id: true, status: true, completionNote: true, linkedInputId: true } });
  if (!item) return NextResponse.json({ error: "Request item not found" }, { status: 404 });
  const status = validStatus(body.status) ? body.status : item.status;
  const completionNote = typeof body.completionNote === "string" ? body.completionNote.trim() || null : item.completionNote;
  if (status === "NOT_APPLICABLE" && !completionNote) return NextResponse.json({ error: "No longer needed requests require a rationale" }, { status: 400 });
  const linked = await validateLinkedInput(body.linkedInputId, id);
  if ("error" in linked) return NextResponse.json({ error: linked.error }, { status: 400 });
  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  if (title !== undefined && !title) return NextResponse.json({ error: "Request title cannot be empty" }, { status: 400 });
  const updated = await prisma.dataRoomRequestItem.update({ where: { id: item.id }, data: { ...(title ? { title } : {}), ...(typeof body.detail === "string" ? { detail: body.detail.trim() || null } : {}), ...(body.status !== undefined ? { status, completionNote, completedAt: status === "REQUESTED" ? null : new Date() } : {}), ...(linked.provided ? { linkedInputId: linked.linkedInputId } : {}) } });
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); const { id } = await params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await allowed(user.email, id, "assessment.submit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  const item = await prisma.dataRoomRequestItem.findFirst({ where: { id: requestId, category: { pack: { organizationId: id } } }, select: { id: true, status: true, linkedInputId: true, completionNote: true } });
  if (!item) return NextResponse.json({ error: "Request item not found" }, { status: 404 });
  if (item.status !== "REQUESTED" || item.linkedInputId || item.completionNote) return NextResponse.json({ error: "Only untouched, unlinked requested items can be deleted. Mark retained history as no longer needed instead." }, { status: 409 });
  await prisma.dataRoomRequestItem.delete({ where: { id: item.id } });
  return NextResponse.json({ deleted: true });
}
