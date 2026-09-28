import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { dataRoomRequestStatuses, summarizeDataRoomRequests, type DataRoomRequestStatus } from "@/lib/data-room/progress";

async function currentUser() { return (await (await createClient()).auth.getUser()).data.user; }
async function allowed(email: string | undefined, organizationId: string, permission: "client.read" | "assessment.submit") { return Boolean(email && await hasOrganizationPermission(email, organizationId, permission)); }
function validStatus(value: unknown): value is DataRoomRequestStatus { return typeof value === "string" && (dataRoomRequestStatuses as readonly string[]).includes(value); }

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
  if (typeof body.requestId !== "string" || !validStatus(body.status)) return NextResponse.json({ error: "requestId and a valid status are required" }, { status: 400 });
  const item = await prisma.dataRoomRequestItem.findFirst({ where: { id: body.requestId, category: { pack: { organizationId: id } } }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Request item not found" }, { status: 404 });
  const completionNote = typeof body.completionNote === "string" ? body.completionNote.trim() || null : null;
  if (body.status === "NOT_APPLICABLE" && !completionNote) return NextResponse.json({ error: "Not applicable requests require a rationale" }, { status: 400 });
  const updated = await prisma.dataRoomRequestItem.update({ where: { id: item.id }, data: { status: body.status, completionNote, completedAt: body.status === "REQUESTED" ? null : new Date() } });
  return NextResponse.json(updated);
}
