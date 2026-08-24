import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

const EDITABLE_FIELDS = [
  "title",
  "description",
  "relatedCapabilityIds",
  "relatedKPIIds",
  "estimatedValue",
  "priorityScore",
  "reviewNotes",
] as const;

const ACTION_STATUS = {
  submit: { status: "PENDING_REVIEW", feedbackAction: "submitted" },
  approve: { status: "APPROVED", feedbackAction: "approved" },
  reject: { status: "REJECTED", feedbackAction: "rejected" },
} as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const recommendation = await prisma.recommendation.findUnique({ where: { id } });
  if (!recommendation) {
    return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
  }
  if (!(await hasOrganizationPermission(user.email, recommendation.organizationId, "recommendation.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const action = body.action as string | undefined;

  if (action && !(action in ACTION_STATUS)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "reject") {
    if (typeof body.reason !== "string" || !body.reason.trim()) {
      return NextResponse.json({ error: "A reason is required when rejecting a recommendation" }, { status: 400 });
    }
    if (body.reason.trim().length > 2000) {
      return NextResponse.json({ error: "Rejection reason must be 2000 characters or fewer" }, { status: 400 });
    }
  }

  if (action) {
    const selectedAction = ACTION_STATUS[action as keyof typeof ACTION_STATUS];
    const allowedStates = action === "submit" ? ["DRAFT", "EDITED"] : ["PENDING_REVIEW"];
    if (!allowedStates.includes(recommendation.status)) {
      return NextResponse.json(
        { error: `Recommendation must be in ${action === "submit" ? "DRAFT or EDITED" : "PENDING_REVIEW"} before it can be ${action === "submit" ? "submitted" : action === "approve" ? "approved" : "rejected"}` },
        { status: 409 }
      );
    }
    const updated = await prisma.$transaction(async (tx) => {
      const transition = await tx.recommendation.updateMany({
        where: { id, status: recommendation.status },
        data: {
          status: selectedAction.status,
          reviewedBy: user.email ?? null,
          reviewNotes: body.reason ?? recommendation.reviewNotes,
        },
      });
      if (transition.count !== 1) return null;

      await tx.recommendationFeedback.create({
        data: {
          recommendationId: id,
          action: selectedAction.feedbackAction,
          reason: body.reason ?? null,
          actedBy: user.email ?? null,
        },
      });
      return tx.recommendation.findUniqueOrThrow({ where: { id } });
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Recommendation changed before this action could be applied" },
        { status: 409 }
      );
    }
    return NextResponse.json(updated);
  }

  const editedFields = Object.fromEntries(
    EDITABLE_FIELDS
      .filter((field): field is EditableField => Object.prototype.hasOwnProperty.call(body, field))
      .map((field) => [field, body[field]])
  );

  if (Object.keys(editedFields).length === 0) {
    return NextResponse.json(
      { error: "At least one editable field or action is required" },
      { status: 400 }
    );
  }

  if ("title" in editedFields && (typeof editedFields.title !== "string" || !editedFields.title.trim())) {
    return NextResponse.json({ error: "title must not be empty" }, { status: 400 });
  }
  if ("description" in editedFields && (typeof editedFields.description !== "string" || !editedFields.description.trim())) {
    return NextResponse.json({ error: "description must not be empty" }, { status: 400 });
  }
  if ("relatedCapabilityIds" in editedFields && !Array.isArray(editedFields.relatedCapabilityIds)) {
    return NextResponse.json({ error: "relatedCapabilityIds must be an array" }, { status: 400 });
  }
  if ("relatedKPIIds" in editedFields && !Array.isArray(editedFields.relatedKPIIds)) {
    return NextResponse.json({ error: "relatedKPIIds must be an array" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextRecommendation = await tx.recommendation.update({
      where: { id },
      data: { ...editedFields, status: "EDITED" },
    });
    await tx.recommendationFeedback.create({
      data: {
        recommendationId: id,
        action: "edited",
        originalFields: Object.fromEntries(
          Object.keys(editedFields).map((field) => [field, recommendation[field as EditableField]])
        ),
        editedFields,
        reason: body.reason ?? null,
        actedBy: user.email ?? null,
      },
    });
    return nextRecommendation;
  });

  return NextResponse.json(updated);
}
