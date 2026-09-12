import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { exchangeAuthorizationCode, isOAuthStateValid } from "@/lib/integrations/microsoft-oauth";
import { OAUTH_STATE_COOKIE, verifyOAuthState } from "@/lib/integrations/oauth-state";
import { integrationSecretKey, saveConnection } from "@/lib/integrations/connection-store";
import { prisma } from "@/lib/db";

/**
 * Completes the Microsoft Entra authorization-code flow.
 *
 * Deliberately organisation-agnostic: Entra requires a redirect URI to match
 * exactly, so a per-client callback path would need one app registration per
 * client. The organisation travels in the signed state cookie instead, and the
 * callback proves the signed-in user still has permission for it.
 *
 * Fails closed at every boundary: the cookie must verify, the returned state
 * must match, and the user must hold client.configure on the organisation in
 * the cookie. Tokens are encrypted before they reach the database and are never
 * returned to the caller. Any failure redirects with an error code — a
 * connection is only recorded when the exchange genuinely succeeded.
 */
export async function GET(request: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fail = (organizationId: string | null, code: string) => {
    const target = organizationId
      ? new URL(`/clients/${organizationId}/integrations/sharepoint`, request.nextUrl.origin)
      : new URL("/dashboard", request.nextUrl.origin);
    target.searchParams.set("sharepoint", code);
    return NextResponse.redirect(target);
  };

  let key: string;
  try {
    key = integrationSecretKey();
  } catch {
    return NextResponse.json({ error: "Integration secret key is not configured" }, { status: 500 });
  }

  const cookieValue = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  let payload;
  try {
    payload = verifyOAuthState(cookieValue ?? "", key);
  } catch {
    return fail(null, "state_invalid");
  }

  const { organizationId } = payload;

  // The cookie is signed, but permissions may have changed since the flow began.
  if (!(await hasOrganizationPermission(user.email, organizationId, "client.configure"))) {
    return fail(null, "forbidden");
  }

  const returnedState = request.nextUrl.searchParams.get("state");
  if (!isOAuthStateValid(returnedState, payload.state)) return fail(organizationId, "state_mismatch");

  if (request.nextUrl.searchParams.get("error")) return fail(organizationId, "consent_denied");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return fail(organizationId, "code_missing");

  const clientSecret = process.env.MICROSOFT_ENTRA_CLIENT_SECRET;
  if (!clientSecret) return fail(organizationId, "not_configured");

  let tokens;
  try {
    tokens = await exchangeAuthorizationCode({
      code,
      clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID as string,
      tenantId: process.env.MICROSOFT_ENTRA_TENANT_ID as string,
      redirectUri: process.env.MICROSOFT_ENTRA_REDIRECT_URI as string,
      clientSecret,
    });
  } catch {
    // Never surface provider detail (or anything token-shaped) to the browser.
    return fail(organizationId, "exchange_failed");
  }

  try {
    await saveConnection(prisma, {
      organizationId,
      tokens,
      accountEmail: user.email,
      externalTenantId: process.env.MICROSOFT_ENTRA_TENANT_ID ?? null,
    });
  } catch {
    return fail(organizationId, "persist_failed");
  }

  const target = new URL(`/clients/${organizationId}/integrations/sharepoint`, request.nextUrl.origin);
  target.searchParams.set("sharepoint", "connected");
  const response = NextResponse.redirect(target);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}
