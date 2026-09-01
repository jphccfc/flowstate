import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { buildMicrosoft365AuthorizationUrl, createMicrosoft365OAuthState, getMicrosoft365ConnectionReadiness, getMicrosoft365OAuthConfiguration } from "@/lib/integrations/sharepoint";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.configure"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const readiness = getMicrosoft365ConnectionReadiness();
  if (!readiness.configured) return NextResponse.json({ organizationId: id, ...readiness, connectionState: "NotConfigured", missingConfiguration: readiness.missingConfiguration, message: "Microsoft 365 connection is not configured." });

  const state = createMicrosoft365OAuthState();
  const authorizationUrl = buildMicrosoft365AuthorizationUrl({ ...getMicrosoft365OAuthConfiguration(), state: state.value });
  const response = NextResponse.json({ organizationId: id, provider: "microsoft-365", connectionState: "Ready", configured: true, syncEnabled: false, authorizationUrl });
  response.cookies.set(`m365_oauth_state_${id.replace(/[^A-Za-z0-9_-]/g, "_")}`, state.value, state.cookie);
  return response;
}
