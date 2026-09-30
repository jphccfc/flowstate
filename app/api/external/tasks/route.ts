import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import {
  assignmentWhere,
  externalTaskSelect,
  resolveExternalPortalAccess,
} from "@/lib/auth/external-portal";

export async function GET(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });

  const access = await resolveExternalPortalAccess(user.email, organizationId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tasks = await prisma.assessmentTask.findMany({
    where: { organizationId, ...assignmentWhere(access) },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    select: externalTaskSelect,
  });
  return NextResponse.json(tasks);
}
