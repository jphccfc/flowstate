import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import {
  assignmentWhere,
  externalTaskSelect,
  resolveExternalPortalAccess,
} from "@/lib/auth/external-portal";

const MAX_COMMENT_LENGTH = 4_000;

type MutationBody = {
  complete?: unknown;
  comment?: unknown;
  status?: unknown;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: MutationBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required" }, { status: 400 });
  }
  if ("status" in body) {
    return NextResponse.json({ error: "External users may only complete a task" }, { status: 400 });
  }
  if (body.complete !== undefined && body.complete !== true) {
    return NextResponse.json({ error: "complete must be true when provided" }, { status: 400 });
  }
  if (body.comment !== undefined && typeof body.comment !== "string") {
    return NextResponse.json({ error: "comment must be a string" }, { status: 400 });
  }

  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (body.comment !== undefined && !comment) {
    return NextResponse.json({ error: "comment cannot be empty" }, { status: 400 });
  }
  if (comment.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: `comment must be ${MAX_COMMENT_LENGTH} characters or fewer` }, { status: 400 });
  }
  const complete = body.complete === true;
  if (!complete && !comment) {
    return NextResponse.json({ error: "complete or comment is required" }, { status: 400 });
  }

  const { taskId } = await params;
  const taskScope = await prisma.assessmentTask.findUnique({
    where: { id: taskId },
    select: { organizationId: true },
  });
  if (!taskScope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const access = await resolveExternalPortalAccess(user.email, taskScope.organizationId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const task = await prisma.assessmentTask.findFirst({
    where: { id: taskId, organizationId: taskScope.organizationId, ...assignmentWhere(access) },
    select: {
      id: true,
      status: true,
      externalAssignees: {
        where: { stakeholderId: { in: access.stakeholderIds } },
        select: { stakeholderId: true },
        take: 1,
      },
    },
  });
  if (!task || task.externalAssignees.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const actorStakeholderId = task.externalAssignees[0].stakeholderId;
  const updated = await prisma.$transaction(async (tx) => {
    let result;
    if (complete && task.status !== "COMPLETED") {
      result = await tx.assessmentTask.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedAt: new Date(), completedById: access.userId },
        select: externalTaskSelect,
      });
      await tx.assessmentTaskActivity.create({
        data: {
          assessmentTaskId: task.id,
          actorUserId: access.userId,
          actorStakeholderId,
          type: "STATUS_CHANGED",
          previousStatus: task.status,
          nextStatus: "COMPLETED",
        },
      });
    } else {
      result = await tx.assessmentTask.findUniqueOrThrow({ where: { id: task.id }, select: externalTaskSelect });
    }

    if (comment) {
      await tx.assessmentTaskActivity.create({
        data: {
          assessmentTaskId: task.id,
          actorUserId: access.userId,
          actorStakeholderId,
          type: "COMMENT_ADDED",
          comment,
        },
      });
    }
    return result;
  });

  return NextResponse.json(updated);
}
