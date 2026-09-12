import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { buildMicrosoftAuthorizeUrl, createOAuthState } from "@/lib/integrations/microsoft-oauth";
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS, signOAuthState } from "@/lib/integrations/oauth-state";
import { integrationSecretKey } from "@/lib/integrations/connection-store";
import { getMicrosoft365ConnectionReadiness } from "@/lib/integrations/sharepoint";

/**
 * Starts the Microsoft Entra authorization-code flow for one organisation.
 *
 * The CSRF state is signed into an httpOnly cookie rather than passed through
 * the client, so the callback can prove which organisation and user began the
 * flow. Nothing is persisted here — a connection only exists once the callback
 * has exchanged the code for tokens.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.configure"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const readiness = getMicrosoft365ConnectionReadiness();
  if (!readiness.configured) {
    return NextResponse.json(
      { error: "Microsoft 365 is not configured", missingConfiguration: readiness.missingConfiguration },
      { status: 409 },
    );
  }

  let key: string;
  try {
    key = integrationSecretKey();
  } catch {
    return NextResponse.json({ error: "Integration secret key is not configured" }, { status: 500 });
  }

  const state = createOAuthState();
  const authorizeUrl = buildMicrosoftAuthorizeUrl({
    clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID as string,
    tenantId: process.env.MICROSOFT_ENTRA_TENANT_ID as string,
    redirectUri: process.env.MICROSOFT_ENTRA_REDIRECT_URI as string,
    state,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(
    OAUTH_STATE_COOKIE,
    signOAuthState(
      { organizationId: id, userId: user.id ?? user.email, state, expiresAt: Date.now() + OAUTH_STATE_TTL_MS },
      key,
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
    },
  );
  return response;
}
