import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { getMicrosoft365ConnectionReadiness } from "@/lib/integrations/sharepoint";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.configure"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const readiness = getMicrosoft365ConnectionReadiness();
  if (!readiness.configured) return NextResponse.json({ organizationId: id, ...readiness, connectionState: "NotConfigured", missingConfiguration: readiness.missingConfiguration });
  return NextResponse.json({ organizationId: id, ...readiness });
}
