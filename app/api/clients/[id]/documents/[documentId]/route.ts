import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  const user = (await (await createClient()).auth.getUser()).data.user;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const document = await prisma.capturedInput.findFirst({
    where: { id: documentId, organizationId: id },
    select: { id: true, type: true, rawText: true, sourceRef: true, sourceItemId: true, sourceVersion: true, sourceHash: true, sourcePath: true, versionLabel: true, versionStatus: true, capturedAt: true, createdAt: true, attachments: { select: { filename: true, contentType: true, sizeBytes: true }, take: 1 }, findings: { select: { id: true, title: true, summary: true, status: true, domainName: true, capabilityName: true, citedExcerpts: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json({ document });
}
