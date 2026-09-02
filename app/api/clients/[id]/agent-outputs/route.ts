import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/organization";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = (await (await createClient()).auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: organizationId } = await params;
  if (!(await canAccessClient(user.email, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const outputs = await prisma.agentOutput.findMany({
    where: { status: "PROVISIONAL", run: { organizationId } },
    orderBy: { createdAt: "desc" },
    include: { run: { include: { capturedInput: true, agentDefinition: { select: { id: true, key: true, name: true } }, promptVersion: { select: { id: true, version: true, prompt: true } } } } },
  });
  return NextResponse.json({ outputs });
}
