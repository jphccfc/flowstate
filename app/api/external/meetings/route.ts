import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import {
  attendanceWhere,
  externalMeetingSelect,
  resolveExternalPortalAccess,
} from "@/lib/auth/external-portal";

export async function GET(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });

  const access = await resolveExternalPortalAccess(user.email, organizationId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const meetings = await prisma.meetingContext.findMany({
    where: { organizationId, ...attendanceWhere(access) },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    select: externalMeetingSelect,
  });
  return NextResponse.json(meetings);
}
